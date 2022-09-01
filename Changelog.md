## 0.0.1-alpha10
Account for terrain elevation in fog-of-war/token vision.
Add setting to switch between accounting for terrain elevation (shader) or not (polygons only) in token vision.
Add setting to toggle automatic elevation changes for tokens.
English localization.
Attempted css to fix size of elevation number in control tools.

## 0.0.1-alpha9
Fixes for v10.279.

## 0.0.1-alpha8
Working in v10.277. Will undoubtedly break in v10.279.

- Elevation layer
  - Set elevation by grid space
  - Set elevation by filling line-of-sight
  - Set elevation by filling space enclosed by walls
  - Load and save elevation by image file
  - Automatic save of elevation settings by scene
  - Undo
  - Clear all elevation, with confirmation dialog
  - Shades of red represent elevation on the elevation layer
  - Hover to see the precise elevation value at a location
- Tokens
  - Visibility of other tokens based on elevation.
  - Automatic elevation change when moving token across the map.
- Lighting
  - Calculate lighting shadows based on wall and light elevation.
  - Account for canvas terrain elevation for lighting shadows
- Fog of War
  - Fog of war polygon modified by wall shadows
  - Does not currently account for terrain elevation

## 0.0.1-alpha7
Updated module.json for installing in v10.

## 0.0.1-alpha6
Switched to better method to block token and lights for shadows. Fixes the visual artifacts. Shadows for a token given unlimited lighting are very faint, which might be fine but would probably prefer a bit more darkness.

All three parts of lighting are blocked fully. Would prefer something with an alpha gradient to blend the lighting shadows.

## 0.0.1-alpha5
Working prototype for token vision and lights. Corrections to the calculation of the shadow polygons and better use of Clipper to union shadows for a given source.

When viewing the vision from a token, areas are shaded if partially obscured by a wall lower than the token. Other tokens elevated above the wall can be seen. Some visual artifacts when moving tokens around but not too bad.

Lights currently add shadows at the lighting layer level, which is not ideal but works for now. Future work needed to mask individual lights properly.

## 0.0.1-alpha4
Working prototype for ambient light sources. When the wall height is less than the light source elevation, one or more shadow polygons are constructed representing how the light is obscured by the wall. For now, shadows are just drawn on the canvas.

## 0.0.1-alpha3
Change the module name. Starting anew on the code.

## 0.0.1-alpha2
Wrap testVisibility in order to hide a token based on elevation.
Given one or more points of vision to a token:
- test for intersection with an Enhanced Terrain Layer polygon.
- Test if the token can be seen from the point(s) of vision, assuming 3-D elevation for the token, wall, and point(s) of vision.
- Hide token as necessary

Also adds a log debug flag using the devMode module, and currently sets a debug flag to visualize the terrain polygons and intersections.

## 0.0.1-alpha1
Basic framework