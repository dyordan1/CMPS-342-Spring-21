"use strict";

// == WebGL ==
let gl;
let canvas;

// == Buffers ==
let vBuffer;

// == Data ==
let verts = [];
let triangles = [];

// == State Machine ==
// 0 = POINTS
// 1 = TRIANGLES
let mode = 0;

// Convert event coordinates into clip space, (-1;1)
let toClip = function(event) {
    return vec3(2*event.clientX/canvas.width-1,
           2*(canvas.height-event.clientY)/canvas.height-1, 0);
}

// Returns true if given vert is convex (follows the winding of the face)
// prev[vec3] - the preceding vertex
// vert[vec3] - the vertex to check
// next[vec3] - the following vertex in vert loop
// avrg[float] - the average z value for the entire face
let isConvex = function(prev, vert, next, avrg) {
    let prevLeg = subtract(prev, vert);
    let nextLeg = subtract(next, vert);
    let crossZ = cross(prevLeg, nextLeg)[2];

    // If both are pointing the same way, the vertex is convex (i.e. cross product
    // is facing the same way as the prevailing face normal).
    return crossZ * avrg > 0;
}

// Determine which side of a line a given point lies on.
// point[vec3] - the point to check
// v1,v2[vec3] - two points defining the line.
let lineSide = function (point, v1, v2)
{
    return (point[0] - v2[0]) * (v1[1] - v2[1]) - (point[1]  - v2[1]) * (v1[0] - v2[0]);
}

// Returns true if the given vec3 is inside the given triangle.
// point[vec3] - the point to check
// v1,v2,v3[vec3] - the triangle (winding order irrelevant)
let triangleContains = function(point, v1, v2, v3)
{
    let d1, d2, d3;
    let has_neg, has_pos;

    // Determine what side of each line the point is on.
    // Winding order is important to be consistent here - maintain passed.
    d1 = lineSide(point, v1, v2);
    d2 = lineSide(point, v2, v3);
    d3 = lineSide(point, v3, v1);

    has_neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    has_pos = (d1 > 0) || (d2 > 0) || (d3 > 0);

    // We don't really know what's inside (pos/neg), but the only situation in
    // which all are positive or all are negative is when the point is inside
    // the triangle.
    return !(has_neg && has_pos);
}

// Add a triangle to the global triangle array for rendering
// v1,v2,v3[vec3] - the triangle
let addTriangle = function(v1, v2, v3) {
    triangles.push(v1);
    triangles.push(v2);
    triangles.push(v3);
}

window.onload = function init()
{
    canvas = document.getElementById( "gl-canvas" );

    gl = WebGLUtils.setupWebGL( canvas );
    if ( !gl ) { alert( "WebGL isn't available" ); }

    //
    //  Configure WebGL
    //
    gl.viewport( 0, 0, canvas.width, canvas.height );
    gl.clearColor( 1.0, .7, .7, 1.0 );

    //  Load shaders and initialize attribute buffers
    var program = initShaders( gl, "vertex-shader", "circle-shader" );
    gl.useProgram( program );

    canvas.addEventListener("mousedown", function(event){
        // Add the point to global array of verts
        let vert = toClip(event);
        verts.push(vert);

        // Only tessellate if >=3 verts
        if (verts.length >= 3) {
          // Reset triangle array
          triangles = [];

          // Copy vertex set over
          let vertCopy = JSON.parse(JSON.stringify(verts));
          // Set current index to first vertex
          let curr = 0;

          // Protect from infinite loops
          let len = vertCopy.length;
          let times = 0;

          // Find the average z
          let avrg = 0;
          for (let i = 0; i < vertCopy.length; i++) {
            // Find prev/next index, accounting for falling off edge
            let prev = i > 0 ? i-1 : vertCopy.length - 1;
            let next = i < vertCopy.length - 1 ? i + 1 : 0;

            // Find cross product of the two legs
            let prevLeg = subtract(vertCopy[prev], vertCopy[i]);
            let nextLeg = subtract(vertCopy[next], vertCopy[i]);
            avrg = cross(prevLeg, nextLeg)[2];
          }
          avrg /= vertCopy.length;

          // We'll keep cutting ears until we have 3 verts remaining
          while (vertCopy.length > 3) {
            // Somewhat arbitrary heuristic to prevent hangs
            // Increment times every time we *don't* cut an ear
            // Reset it every time we do
            // If we loop around the full length twice, bail and give error
            if (vertCopy.length == len) {
              times += 1;
            } else {
              len = vertCopy.length;
              times = 0;
            }
            if (len*2 == times) {
              console.log("Can't tessellate:", vertCopy);

              // Reset the app.
              mode = 0;
              verts = [];
              triangles = [];
              gl.bindBuffer( gl.ARRAY_BUFFER, vBuffer);
              gl.bufferData( gl.ARRAY_BUFFER, flatten(verts), gl.STATIC_DRAW );
              return;
            }

            // Find prev/next index, accounting for falling off edge.
            let prev = curr > 0 ? curr-1 : vertCopy.length - 1;
            let next = curr < vertCopy.length - 1 ? curr + 1 : 0;
            // If current vertex is convex...
            if (isConvex(vertCopy[prev], vertCopy[curr], vertCopy[next], avrg)) {
              // Check if any of the remaining verts are contained within the
              // triangle formed by this vertex and the two adjacent to it.
              // If we were to assume this is an ear, we run into tessellation
              // issues later. This is largely the reason we hit hangs.
              let is_ear = true;
              let nextnext = next < vertCopy.length - 1 ? next + 1 : 0;
              for (let i = nextnext; i != prev; i = i < vertCopy.length - 1 ? i+1 : 0) {
                if (triangleContains(vertCopy[i], vertCopy[prev], vertCopy[curr], vertCopy[next])) {
                  // Found a vert inside the triangle, set not ear and bail.
                  is_ear = false;
                  break;
                }
              }

              // Only add triangle if we didn't find any verts above.
              if (is_ear) {
                addTriangle(vertCopy[prev], vertCopy[curr], vertCopy[next]);
                vertCopy.splice(curr, 1);
              }
            }
            curr = curr > 0 ? curr-1 : vertCopy.length - 1;
          }

          // Loop is complete - meaning we have one last triangle
          addTriangle(vertCopy[0], vertCopy[1], vertCopy[2]);

          // Set display mode to triangle and send buffer data
          mode = 1;
          gl.bindBuffer( gl.ARRAY_BUFFER, vBuffer);
          gl.bufferData( gl.ARRAY_BUFFER, flatten(triangles), gl.STATIC_DRAW );
        } else {
          // Set display mode to point and send buffer data
          mode = 0;
          gl.bindBuffer( gl.ARRAY_BUFFER, vBuffer);
          gl.bufferData( gl.ARRAY_BUFFER, flatten(verts), gl.STATIC_DRAW );
        }

        // Immediately draw - no animation here
        window.requestAnimFrame(render);
    } );

    vBuffer = gl.createBuffer();
    gl.bindBuffer( gl.ARRAY_BUFFER, vBuffer );

    var vPosition = gl.getAttribLocation( program, "vPosition" );
    gl.vertexAttribPointer( vPosition, 3, gl.FLOAT, false, 0, 0 );
    gl.enableVertexAttribArray( vPosition );

    // Draw first (empty) frame
    window.requestAnimFrame(render);
};

function render() {
    // Nothing too exciting here, but note that we don't animate.
    gl.clear( gl.COLOR_BUFFER_BIT );
    if (mode == 1) {
      gl.drawArrays( gl.TRIANGLES, 0, triangles.length );
    } else {
      gl.drawArrays( gl.POINTS, 0, verts.length );
    }
}
