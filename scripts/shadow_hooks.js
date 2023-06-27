/* globals
canvas,
flattenObject,
GlobalLightSource,
Hooks,
PIXI,
PointSourcePolygon,
PolygonMesher,
VisionSource
*/
"use strict";
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

import { MODULE_ID } from "./const.js";
import { Point3d } from "./geometry/3d/Point3d.js";
import { SETTINGS, getSceneSetting } from "./settings.js";

import { ShadowWallShader, ShadowWallPointSourceMesh } from "./glsl/ShadowWallShader.js";
import { ShadowTextureRenderer, ShadowVisionLOSTextureRenderer } from "./glsl/ShadowTextureRenderer.js";
import { PointSourceShadowWallGeometry, SourceShadowWallGeometry } from "./glsl/SourceShadowWallGeometry.js";
import { ShadowVisionMaskShader, ShadowVisionMaskTokenLOSShader } from "./glsl/ShadowVisionMaskShader.js";
import { EVQuadMesh } from "./glsl/EVQuadMesh.js";
import { TestShadowShader } from "./glsl/TestShadowShader.js";

// NOTE: Wraps for RenderedPointSource methods.

export function _configureRenderedPointSource(wrapped, changes) {
  wrapped(changes);

  // At this point, ev property should exist on source b/c of initialize shaders hook.
  const ev = this[MODULE_ID];
  if ( !ev ) return;

  console.log(`${MODULE_ID}|_configureRenderedPointSource (${this.constructor.name}) for ${this.object?.name || this.object?.id} with ${Object.keys(changes).length} changed properties.`, changes);

  // Test for different change properties
  const changedPosition = Object.hasOwn(changes, "x") || Object.hasOwn(changes, "y");
  const changedRadius = Object.hasOwn(changes, "radius");
  const changedElevation = Object.hasOwn(changes, "elevation");

  if ( changedPosition || changedElevation || changedRadius ) {
    // console.log(`EV|refreshAmbientLightHook light ${object.source.x},${object.source.y},${object.source.elevationE} flag: ${object.document.flags.elevatedvision.elevation}`);
    ev.geom?.refreshWalls();
    ev.shadowMesh?.updateLightPosition();
    ev.shadowVisionLOSMesh?.updateLightPosition();
    if ( this instanceof VisionSource ) updateLOSGeometryVisionSource(this);
  }

  if ( changedPosition ) {
    ev.shadowRenderer?.update();
    ev.shadowVisionLOSRenderer?.update();
    ev.shadowQuadMesh?.updateGeometry(ev.shadowRenderer.sourceBounds);
    ev.shadowVisionMask.position.copyFrom(this);

  } else if ( changedRadius ) {
    ev.shadowRenderer?.updateSourceRadius();
    ev.shadowQuadMesh?.updateGeometry(ev.shadowRenderer.sourceBounds);
    ev.shadowVisionMask.scale = { x: this.radius, y: this.radius };

  } else if ( changedElevation ) {
    ev.shadowRenderer?.update();
    ev.shadowVisionLOSRenderer?.update();
  }
}

export function destroyRenderedPointSource(wrapped) {
  console.log(`${MODULE_ID}|destroyRenderedPointSource (${this.constructor.name}) for ${this.object?.name || this.object?.id}.`);
  const ev = this[MODULE_ID];
  if ( !ev ) return wrapped();

  if ( ev.shadowQuadMesh && canvas.effects.EVshadows ) canvas.effects.EVshadows.removeChild(ev.shadowQuadMesh);

  const assets = [
    "shadowQuadMesh",
    "shadowRenderer",
    "shadowMesh",
    "wallGeometry",
    "shadowVisionMask",
    "shadowVisionLOSMask",
    "shadowVisionLOSMesh",
    "shadowVisionLOSRenderer",
    "losGeometry"
  ];

  for ( const asset of assets ) {
    if ( !ev[asset] ) continue;
    ev[asset].destroy();
    ev[asset] = undefined;
  }

  return wrapped();
}

// NOTE: Hooks used for updating source shadow geometry, mesh, texture

/**
 * Store a shadow texture for a given (rendered) source.
 * 1. Store wall geometry.
 * 2. Store a mesh with encoded shadow data.
 * 3. Render the shadow data to a texture.
 * @param {RenderedPointSource} source
 */
function initializeSourceShadersHook(source) {
  if ( source instanceof GlobalLightSource ) return;
  const ev = source[MODULE_ID] ??= {};

  // Build the geometry.
  ev.wallGeometry ??= new PointSourceShadowWallGeometry(source);

  // Build the shadow mesh.
  if ( !ev.shadowMesh ) {
    ev.shadowMesh = new ShadowWallPointSourceMesh(source, ev.wallGeometry);

    // Force a uniform update, to avoid ghosting of placeables in the light radius.
    // TODO: Find the underlying issue and fix this!
    // Why doesn't this work:
//     source.layers.background.shader.uniformGroup.update();
//     source.layers.coloration.shader.uniformGroup.update();
//     source.layers.illumination.shader.uniformGroup.update();
    const { ALGORITHM, TYPES } = SETTINGS.SHADING;
    const EVshadows = getSceneSetting(ALGORITHM) === TYPES.WEBGL;
    source.layers.background.shader.uniforms.EVshadows = EVshadows;
    source.layers.coloration.shader.uniforms.EVshadows = EVshadows;
    source.layers.illumination.shader.uniforms.EVshadows = EVshadows;
  }

  // Build the shadow render texture
  ev.shadowRenderer ??= new ShadowTextureRenderer(source, ev.shadowMesh);
  ev.shadowRenderer.renderShadowMeshToTexture();

  // Build the vision mask.
  if ( !ev.shadowVisionMask ) {
    const shader = ShadowVisionMaskShader.create(ev.shadowRenderer.renderTexture);
    ev.shadowVisionMask = new PIXI.Mesh(source.layers.background.mesh.geometry, shader);
    ev.shadowVisionMask.position.copyFrom(source);
    ev.shadowVisionMask.scale = { x: source.radius, y: source.radius };
  }

  // If vision source, build extra LOS geometry and add an additional mask for the LOS.
  if ( source instanceof VisionSource && !ev.shadowVisionLOSMesh ) {
    // Shadow mesh of the entire canvas for LOS.
    ev.shadowVisionLOSMesh = new ShadowWallPointSourceMesh(source, ev.visionLOSShadowGeometry);
    ev.shadowVisionLOSRenderer = new ShadowVisionLOSTextureRenderer(source, ev.shadowVisionLOSMesh);
    ev.shadowVisionLOSRenderer.renderShadowMeshToTexture();

    // Add or update the LOS geometry for the vision source.
    updateLOSGeometryVisionSource(source);

    // Build LOS vision mask.
    const shader = ShadowVisionMaskTokenLOSShader.create(ev.shadowVisionLOSRenderer.renderTexture);
    ev.shadowVisionLOSMask = new PIXI.Mesh(source[MODULE_ID].losGeometry, shader);
  }

  // TODO: Comment out the shadowQuadMesh.
  // Testing use only.
  if ( !ev.shadowQuadMesh ) {
    const shader = TestShadowShader.create(ev.shadowRenderer.renderTexture);
    ev.shadowQuadMesh = new EVQuadMesh(ev.shadowRenderer.sourceBounds, shader);
  }
  // For testing, add to the canvas effects
  //   if ( !canvas.effects.EVshadows ) canvas.effects.EVshadows = canvas.effects.addChild(new PIXI.Container());
  //   canvas.effects.EVshadows.addChild(ev.shadowQuadMesh);
  source.layers.illumination.shader.uniforms.uEVShadowSampler = ev.shadowRenderer.renderTexture.baseTexture;
  source.layers.coloration.shader.uniforms.uEVShadowSampler = ev.shadowRenderer.renderTexture.baseTexture;
  source.layers.background.shader.uniforms.uEVShadowSampler = ev.shadowRenderer.renderTexture.baseTexture;
}

/**
 * Update the los geometry for a vision source shape used in the vision mask.
 * Copy of RenderedPointSource.prototype.#updateGeometry
 */
function updateLOSGeometryVisionSource(source) {
  const {x, y} = source.data;
  const offset = source._flags.renderSoftEdges ? source.constructor.EDGE_OFFSET : 0;
  const pm = new PolygonMesher(source.los, {x, y, radius: 0, normalize: false, offset});
  source[MODULE_ID].losGeometry ??= null;
  source[MODULE_ID].losGeometry = pm.triangulate(source[MODULE_ID].losGeometry);
}


// NOTE: Wall Document Hooks

/**
 * A hook event that fires for every embedded Document type after conclusion of a creation workflow.
 * Substitute the Document name in the hook event to target a specific type, for example "createToken".
 * This hook fires for all connected clients after the creation has been processed.
 *
 * @event createDocument
 * @category Document
 * @param {Document} document                       The new Document instance which has been created
 * @param {DocumentModificationContext} options     Additional options which modified the creation request
 * @param {string} userId                           The ID of the User who triggered the creation workflow
 */
function createWallHook(wallD, _options, _userId) {
  const sources = [
    ...canvas.effects.lightSources,
    ...canvas.effects.visionSources,
    ...canvas.sounds.sources
  ];

  for ( const src of sources ) {
    const ev = src[MODULE_ID];
    if ( !ev ) continue;
    ev.wallGeometry?.addWall(wallD.object);
    ev.shadowRenderer?.update();
  }
}

/**
 * A hook event that fires for every Document type after conclusion of an update workflow.
 * Substitute the Document name in the hook event to target a specific Document type, for example "updateActor".
 * This hook fires for all connected clients after the update has been processed.
 *
 * @event updateDocument
 * @category Document
 * @param {Document} document                       The existing Document which was updated
 * @param {object} change                           Differential data that was used to update the document
 * @param {DocumentModificationContext} options     Additional options which modified the update request
 * @param {string} userId                           The ID of the User who triggered the update workflow
 */
function updateWallHook(wallD, data, _options, _userId) {
  const changes = new Set(Object.keys(flattenObject(data)));
  // TODO: Will eventually need to monitor changes for sounds and sight, possibly move.
  // TODO: Need to deal with threshold as well
  const changeFlags = SourceShadowWallGeometry.CHANGE_FLAGS;
  if ( !(changeFlags.WALL_COORDINATES.some(f => changes.has(f))
    || changeFlags.WALL_RESTRICTED.some(f => changes.has(f))) ) return;

  const sources = [
    ...canvas.effects.lightSources,
    ...canvas.effects.visionSources,
    ...canvas.sounds.sources
  ];

  for ( const src of sources ) {
    const ev = src[MODULE_ID];
    if ( !ev ) continue;
    ev.wallGeometry?.updateWall(wallD.object, { changes });
    ev.shadowRenderer?.update();
  }
}

/**
 * A hook event that fires for every Document type after conclusion of an deletion workflow.
 * Substitute the Document name in the hook event to target a specific Document type, for example "deleteActor".
 * This hook fires for all connected clients after the deletion has been processed.
 *
 * @event deleteDocument
 * @category Document
 * @param {Document} document                       The existing Document which was deleted
 * @param {DocumentModificationContext} options     Additional options which modified the deletion request
 * @param {string} userId                           The ID of the User who triggered the deletion workflow
 */
function deleteWallHook(wallD, _options, _userId) {
  const sources = [
    ...canvas.effects.lightSources,
    ...canvas.effects.visionSources,
    ...canvas.sounds.sources
  ];

  for ( const src of sources ) {
    const ev = src[MODULE_ID];
    if ( !ev ) continue;
    ev.wallGeometry?.removeWall(wallD.id);
    ev.shadowRenderer?.update();
  }
}

// Hooks.on("drawAmbientLight", drawAmbientLightHook);

Hooks.on("createWall", createWallHook);
Hooks.on("updateWall", updateWallHook);
Hooks.on("deleteWall", deleteWallHook);

Hooks.on("initializeLightSourceShaders", initializeSourceShadersHook);
Hooks.on("initializeVisionSourceShaders", initializeSourceShadersHook);
