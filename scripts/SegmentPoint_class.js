// Need to track points along segments.
// the polygon has points ordered as one would draw them, in an array [x0, y0, x1, y1,...]
// Segments can be easily constructed for each set [x0, y0, x1, y1], [x1, y1, x2, y2], ...
// Need to:
// - sort points clockwise around a vision point
// - track which segments are associated with each point
import { almostEqual } from "./utility.js";
import { orient2d } from "./lib/orient2d.js";
import { MODULE_ID, log } from "./module.js";

/*
 * Class to represent a point with certain features.
 * - point tracks what segments contain it as an endpoint
 * - equality test using almost equal
 */
export class SegmentPoint extends PIXI.Point {
  constructor(x, y) {
    super(x, y);
    this.segments = new Map;
  }
  
  /*
   * Almost equal version that treats points as equal if within epsilon error
   * @param {PIXI.Point} p  Point in {x, y} format.
   * @return {boolean} true if the two points are with epsilon from one another.
   */
  equals(p, EPSILON = 1e-5) {
    return (almostEqual(this.x, p.x, EPSILON) && almostEqual(this.y, p.y, EPSILON));
  }
  
  /*
   * Factory function to construct segment points from a segment
   * @param {Ray} segment         Ray representing a segment with points A and B.
   * @param {Number} segment_idx  Index for the segment, for tracking.
   * @return {s1: SegmentPoint, s2: SegmentPoint} Object containing the two segment 
   *   points for Ray.A and Ray.B, respectively.
   */ 
   static constructSegmentPoints(segment) {
     const s1 = new SegmentPoint(segment.A.x, segment.A.y);
     const s2 = new SegmentPoint(segment.B.x, segment.B.y);
     
     // can set directly b/c we know the segment has those endpoints
     s1.segments.set(segment.id || foundry.utils.randomID(), segment);
     s2.segments.set(segment.id || foundry.utils.randomID(), segment);
   
     return { A: s1,
              B: s2 };
   }
     
  /*
   * Test if segment should be included in the index set
   * @param {Ray} segment   Segment to test
   * @param {Number} idx    Index of the segment
   * return {boolean} true if the segment was included
   */
   includeSegment(segment) {
     if(this.equals(segment.A) || this.equals(segment.B)) {
       this.segments.set(segment.id || foundry.utils.randomID(), segment);
       return true;
     }
     return false;
   }
   
  /*
   * Get squared distance from this point to another point.
   * Squared for comparison purposes, avoiding the sqrt
   * @param {PIXI.Point} p    Point to measure
   * @return {Number}  Squared distance.
   */
   squaredDistance(p) {
     if(this.equals(p)) return 0;
     
     // perf test; not much difference here. See https://stackoverflow.com/questions/26593302/whats-the-fastest-way-to-square-a-number-in-javascript/53663890 
     return (Math.pow(p.x - this.x, 2) + Math.pow(p.y - this.y, 2));
   }
/*
 * Class extending Ray to represent a segment on the map, often in a polygon
 * - provides a unique id for the segment
 * - adds almost equal test
 * - measures ccr against a vision point
 * - provides next and previous methods if chaining as in a polygon
 */ 
export class Segment extends Ray {
  constructor(A, B) {
    super(A, B);
    this.id = foundry.utils.randomID();
    this.originating_object = undefined; // typically used to set the id of the object 
                                         // to which this segment belongs
    this.properties = {}; // typically used to characterize the segments  
    this.splits = undefined;                                    
  }
  
 /*
  * Reverse the direction of the Segment
  * @return {Segment}
  */
  reverse() {
    // cannot simply use super b/c it calls new Ray instead of new this.
    s = new this(this.B, this.A);
    s._distance = this._distance;
    s._angle = Math.PI - this._angle;
    returns s;
  }

 /*
  * Orient ccw based on vision point
  * Either return this segment or reverse it
  * @return {Segment}
  */
  orientToPoint(p) {
    if(this.ccw(p)) return this;
    return this.reverse();
  }
  
 /*
  * Test if a segment is equivalent to this one.
  * @param {Ray} segment      Segment to test.
  * @param {Number} EPSILON   Treat equal if within this error
  * @return 0 if not equivalent, -1 if equivalent when reversed, 1 if equivalent  
  */ 
  equivalent(segment, EPSILON = 1e-5) {
    if(almostEqual(this.A.x, segment.A.x, EPSILON) && 
       almostEqual(this.A.y, segment.A.y, EPSILON) &&
       almostEqual(this.B.x, segment.B.x, EPSILON) &&
       almostEqual(this.B.y, segment.B.y, EPSILON)) return 1;
       
    if(almostEqual(this.A.x, segment.B.x, EPSILON) && 
       almostEqual(this.A.y, segment.B.y, EPSILON) &&
       almostEqual(this.B.x, segment.A.x, EPSILON) &&
       almostEqual(this.B.y, segment.A.y, EPSILON)) return -1;
  
    return 0;
  }
  
 /*
  * Determine if (vision point) to segment is counter-clockwise, clockwise, 
  *   or in line when comparing to the segment end point B.
  *   (s.B is left of directed line p --> s.A)
  * @param {PIXI.Point} p   Point to test, in {x, y} format.
  * @return positive value if counterclockwise, 
  *   0 if collinear, negative value if clockwise
  */
  orient2d(p) {
    return orient2d(p.x, p.y, this.A.x, this.A.y, this.B.x, this.B.y);
  }
  
 /*
  * Test if endpoint B is counter-clockwise (left) compared to a (vision) point,
  *   if one drew a line from the point to endpoint A. 
  * @param {PIXI.Point} p   Point to test, in {x, y} format.
  * @return {boolean} true if counter-clockwise
  */
  ccw(p) {
    this.orient2d(p) > 0;
  }
  
 /*
  * Test if a point is a segment endpoint.
  * @param {PIXI.Point} p   Point to test
  * @return {boolean} true if the point is almost equal to an endpoint
  */
  isEndpoint(p, EPSILON = 1e-5) {
    return ((almostEqual(p.x, this.A.x, EPSILON) && 
             almostEqual(p.y, this.A.y, EPSILON)) || 
            (almostEqual(p.x, this.A.x, EPSILON) && 
             almostEqual(p.y, this.A.y, EPSILON))); 
  }
  
 /*
  * Test if point is on the segment.
  * @param {PIXI.Point} p   Point to test
  * @param {boolean} true if segment includes point
  */
  contains(p, EPSILON = 1e-5) {
    // test if collinear
    if(orient2d(this.A.x, this.A.y, p.x, p.y, this.B.x, this.B.y)) return false;
    
    // test if endpoint
    if(this.isEndpoint(p, EPSILON)) return true;
    
    // test if between the endpoints
    // recall that we already established the point is collinear above.
    return (p.x < max(this.A.x, this.B.x) &&
            p.x > min(this.A.x, this.B.x) &&
            p.y < max(this.A.y, this.B.y) &&
            p.y > min(this.A.y, this.B.y));
  }
  
 /*
  * Get array of all splits
  * Splits are recursive, so this follows down the recursion
  * @return [Array{Segment}] Array of Segments representing a copy of the split segments
  */
  getSplits() {
    if(!this.splits) return [this];
    return this.splits.A.getSplits().concat(this.splits.B.getSplits);
  }
  
 /*
  * Split a segment along a point.
  * store the segment splits
  * @param {PIXI.Point} p   Point to use for the split
  */
  split(p) {
    if(!contains(value)) {
      console.error(`${MODULE_ID}|Segment class split method: Point is not within the segment.`);
    }
    
    this.splits = { A: new Segment({ x: this.A.x, y: this.A.y }, 
                                   { x: value.x, y: value.y }),
                    B: new Segment({ x: value.x, y: value.y }, 
                                   { x: this.B.x, y: this.B.y }) };
                   
    this.splits.A.originating_object = this;
    this.splits.B.originating_object = this;
    this.splits.A.properties = this.properties;
    this.splits.B.properties = this.properties;    
    this.splits.A.split_id = "A";
    this.splits.B.split_id = "B";  
  }

  
  firstSplit() {
    if(!this.splits) return this;
    return splits.A.firstSplit();
  }
  
  nextSplit() {
//     root
//     - A 
//       - A  
//       - B  
//     - B 
//       - A
//         - A <-- 
//         - B 
//       - B 
    
    if(!this.split_id) return undefined; // should be root or otherwise done.
    if(this.split_id === "A") return this.originating_object.splits.B.firstSplit();   
    if(this.split_id === "B") return this.originating_object.nextSplit();
    return undefined; // shouldn't happen
  }
  
  get next_split() {
    let n = !this._active_split ? this.firstSplit() : this._active_split.nextSplit();
    this._active_split = n;
    return this._active_split;
  }
  
  get active_split() {
    return this._active_split || this;
  }
  
  set active_split(value) {
    this._active_split = value;
  }
  
  
  /*
   * Is the segment to the left of the point?
   * TO-DO: Is this exactly equivalent to ccw? Not totally certain as to the point ordering here.
   * @param {PIXI.Point} p  Point to test
   * @return {boolean} true if the segment is to the left
   */
   // From: https://github.com/Silverwolf90/2d-visibility/blob/a5508bdee8d0a816a2f7457f00a221060a03fe5f/src/segmentInFrontOf.js
   leftOf(p) {
     const cross = (this.B.x - this.A.x) * (p.y - this.A.y)
              - (this.B.y - this.A.y) * (p.x - this.A.x);
     return cross < 0;
   }
  
   /*
    * Factory function to get point between two points
    * @param {PIXI.Point} pointA  Point in {x, y} format.
    * @param {PIXI.Point} pointB  Point in {x, y} format.
    * @param {Number} f           Percent distance for the interpolation
    * @return {PIXI.Point} Interpolated point.
    */
   static interpolate(pointA, pointB, f) {
     return Point(
     pointA.x*(1-f) + pointB.x*f,
     pointA.y*(1-f) + pointB.y*f);
   }
  
  /*
   * Return true if this segment is in front of another segment
   * @param {Segment} segment               Segment to test
   * @param {PIXI.Point} relativePoint  Vision/observer point
   * @return {boolean} true if this segment is in front of the other.
   */
  segmentInFrontOf(segment, relativePoint) {
    const A1 = leftOf(Segment.interpolate(segment.A, segment.B, 0.01));
    const A2 = leftOf(Segment.interpolate(segment.B, segment.A, 0.01));
    const A3 = leftOf(relativePoint);
    
    const B1 = segment.leftOf(Segment.interpolate(this.A, this.B, 0.01));
    const B2 = segment.leftOf(Segment.interpolate(this.B, this.A 0.01)) 
    const B3 = segment.leftOf(relativePoint);
    
    if (B1 === B2 && B2 !== B3) return true;
    if (A1 === A2 && A2 === A3) return true;
    if (A1 === A2 && A2 !== A3) return false;
    if (B1 === B2 && B2 === B3) return false;

    return false;
  }
  
  
}
