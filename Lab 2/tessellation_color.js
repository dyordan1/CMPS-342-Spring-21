"use strict";

// == WebGL ==
let gl;
let canvas;

// == Buffers ==
let vPos;
let vColor;

// == Data ==
let verts = [];
let triangles = [];
let colors = [];

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

// Add a triangle to the global triangles array.
// v1,v2,v3[vec3] - the triangle (winding order irrelevant)
let addTriangle = function(v1, v2, v3) {
    triangles.push(v1);
    triangles.push(v2);
    triangles.push(v3);
    let numTriangles = triangles.length/3;
    let numVerts = verts.length;
    // Progressively lighter color for triangles added later.
    let color = vec4(numTriangles / numVerts, numTriangles / numVerts, numTriangles / numVerts, 1);
    colors.push(color);
    colors.push(color);
    colors.push(color);
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
    let program = initShaders( gl, "vertex-shader", "circle-shader" );
    gl.useProgram( program );

    canvas.addEventListener("mousedown", function(event){
        // Add the point to global array of verts
        let vert = toClip(event);
        verts.push(vert);

        // Only tessellate if >=3 verts
        if (verts.length >= 3) {
            // Reset triangle array
            triangles = [];
            colors = [];

            // Copy vertex set over
            let vertCopy = JSON.parse(JSON.stringify(verts));
            // Set current index to first vertex
            let curr = 0;

            // Protect from infinite loops
            let len = vertCopy.length;
            let times = 0;

            // Find average Z value of all potential ear verts
            let avrg = 0;
            for (let i = 0; i < vertCopy.length; i++) {
                // Find the index of prev/next verts, accounting for edges of array
                let prev = i > 0 ? i-1 : vertCopy.length - 1;
                let next = i < vertCopy.length - 1 ? i + 1 : 0;

                // Add z value of cross product of two legs to average
                let prevLeg = subtract(vertCopy[prev], vertCopy[i]);
                let nextLeg = subtract(vertCopy[next], vertCopy[i]);
                avrg += cross(prevLeg, nextLeg)[2];
            }
            avrg /= vertCopy.length;

            // Continue cutting ears until only 3 verts are left.
            while (vertCopy.length > 3) {
                // Somewhat arbitrary heuristic to know something is wrong
                // Every time we fail to cut an ear, increment times
                // Every time we successfully cut an ear, reset times
                // If times is twice the number of verts remaining, we've been
                // around the full loop twice - bail out.
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
                    colors = [];
                    gl.bindBuffer( gl.ARRAY_BUFFER, vPos);
                    gl.bufferData( gl.ARRAY_BUFFER, flatten(verts), gl.STATIC_DRAW );
                    window.requestAnimFrame(render);
                    return;
                }

                // Find the index of prev/next verts, accounting for edges of array
                let prev = curr > 0 ? curr-1 : vertCopy.length - 1;
                let next = curr < vertCopy.length - 1 ? curr + 1 : 0;

                // If vertex is convex...
                if (isConvex(vertCopy[prev], vertCopy[curr], vertCopy[next], avrg)) {
                    // Check if any other vertices in our loop are within the
                    // triangle defined by this vertex and the two adjacent to
                    // it. If we assumed this is a proper ear without checking,
                    // just because it's convex, we'd run into weird trouble.
                    // This is likely the main reason for infinite loops above.
                    let is_ear = true;
                    let nextnext = next < vertCopy.length - 1 ? next + 1 : 0;
                    for (let i = nextnext; i != prev; i = i < vertCopy.length - 1 ? i+1 : 0) {
                        if (triangleContains(vertCopy[i], vertCopy[prev], vertCopy[curr], vertCopy[next])) {
                            // Found a vertex in the triangle. Bail.
                            is_ear = false;
                            break;
                        }
                    }

                    // Only add triangle if no vertices would be in it.
                    if (is_ear) {
                        addTriangle(vertCopy[prev], vertCopy[curr], vertCopy[next]);
                        vertCopy.splice(curr, 1);
                    }
                }

                // Increment current, accounting for edge of array.
                curr = curr > 0 ? curr-1 : vertCopy.length - 1;
            }

            // One last triangle remains - add it as well.
            addTriangle(vertCopy[0], vertCopy[1], vertCopy[2]);

            // Set to triangle mode and draw.
            mode = 1;
            gl.bindBuffer( gl.ARRAY_BUFFER, vPos);
            gl.bufferData( gl.ARRAY_BUFFER, flatten(triangles), gl.STATIC_DRAW );
            gl.bindBuffer( gl.ARRAY_BUFFER, vColor);
            gl.bufferData( gl.ARRAY_BUFFER, flatten(colors), gl.STATIC_DRAW );
        } else {
            // Set to point mode and draw.
            mode = 0;
            gl.bindBuffer( gl.ARRAY_BUFFER, vPos);
            gl.bufferData( gl.ARRAY_BUFFER, flatten(verts), gl.STATIC_DRAW );
        }

        window.requestAnimFrame(render);
    } );

    vPos = gl.createBuffer();
    gl.bindBuffer( gl.ARRAY_BUFFER, vPos );

    let vPosition = gl.getAttribLocation( program, "vPosition" );
    gl.vertexAttribPointer( vPosition, 3, gl.FLOAT, false, 0, 0 );
    gl.enableVertexAttribArray( vPosition );

    vColor = gl.createBuffer();
    gl.bindBuffer( gl.ARRAY_BUFFER, vColor );

    let vColorAttr = gl.getAttribLocation( program, "vColor" );
    gl.vertexAttribPointer( vColorAttr, 4, gl.FLOAT, false, 0, 0 );
    gl.enableVertexAttribArray( vColorAttr );

    window.requestAnimFrame(render);
};


function render() {
    gl.clear( gl.COLOR_BUFFER_BIT );
    if (mode == 1) {
      gl.drawArrays( gl.TRIANGLES, 0, triangles.length );
    } else {
      gl.drawArrays( gl.POINTS, 0, verts.length );
    }

    // Nothing too exciting here, but note we're not animating.
}
