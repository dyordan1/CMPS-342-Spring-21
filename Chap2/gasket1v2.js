"use strict";

let gl;
let points;

let NumPoints = 5000;

window.onload = function init()
{
    let canvas = document.getElementById( "gl-canvas" );

    gl = WebGLUtils.setupWebGL( canvas );
    if ( !gl ) { alert( "WebGL isn't available" ); }

    //
    //  Initialize our data for the Sierpinski Gasket
    //

    // First, initialize the corners of our gasket with three points.
    let vertices = [
        vec2( -1, -1 ),
        vec2(  0,  1 ),
        vec2(  1, -1 )
    ];

    // Next, generate the rest of the points, by first finding a random point
    //  within our gasket boundary.  We use Barycentric coordinates
    //  (simply the weighted average of the corners) to find the point

    let coeffs = vec3( Math.random(), Math.random(), Math.random() );
    coeffs = normalize( coeffs );

    let a = scale( coeffs[0], vertices[0] );
    let b = scale( coeffs[1], vertices[1] );
    let c = scale( coeffs[2], vertices[2] );

    let p = add( a, add(b, c) );

    // Add our randomly chosen point into our array of points
    points = [ p ];

    for ( let i = 0; points.length < NumPoints; ++i ) {
        let j = Math.floor(Math.random() * 3);

        p = add( points[i], vertices[j] );
        p = scale( 0.5, p );
        points.push( p );
    }

    //
    //  Configure WebGL
    //
    gl.viewport( 0, 0, canvas.width, canvas.height );
    gl.clearColor( 1.0, 1.0, 1.0, 1.0 );

    //  Load shaders and initialize attribute buffers
    let program = initShaders( gl, "shaders/vshader21.glsl",
                               "shaders/fshader21.glsl" );
    gl.useProgram( program );

    // Load the data into the GPU
    let bufferId = gl.createBuffer();
    gl.bindBuffer( gl.ARRAY_BUFFER, bufferId );
    gl.bufferData( gl.ARRAY_BUFFER, flatten(points), gl.STATIC_DRAW );

    // Associate out shader letiables with our data buffer
    let vPos = gl.getAttribLocation( program, "vPosition" );
    gl.vertexAttribPointer( vPos, 2, gl.FLOAT, false, 0, 0 );
    gl.enableVertexAttribArray( vPos );

    render();
};


function render()
{
    gl.clear( gl.COLOR_BUFFER_BIT );
    gl.drawArrays( gl.POINTS, 0, points.length );
}
