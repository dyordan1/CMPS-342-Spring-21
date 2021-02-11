"use strict";

let canvas;
let gl;
let points;

let NumPoints = 5000;

window.onload = function init()
{
    canvas = document.getElementById( "gl-canvas" );

    gl = WebGLUtils.setupWebGL( canvas );
    if ( !gl ) { alert( "WebGL isn't available" ); }

    //
    //  Initialize our data for the Sierpinski Gasket
    //

    // First, initialize the vertices of our 3D gasket

    let vertices = [
        vec3( -0.5, -0.5, -0.5 ),
        vec3(  0.5, -0.5, -0.5 ),
        vec3(  0.0,  0.5,  0.0 ),
        vec3(  0.0, -0.5, 0.5 ),
    ];


    points = [ vec3( 0.0, 0.0, 0.0 ) ];

    for ( let i = 0; points.length < NumPoints; ++i ) {
        let j = Math.floor(Math.random() * 4);

        points.push(mix(points[i], vertices[j], 0.5) );
    }

    //
    //  Configure WebGL
    //
    gl.viewport( 0, 0, canvas.width, canvas.height );
    gl.clearColor( 1.0, 1.0, 1.0, 1.0 );
    gl.enable( gl.DEPTH_TEST );

    //  Load shaders and initialize attribute buffers

    let program = initShaders( gl, "vertex-shader", "fragment-shader" );
    gl.useProgram( program );

    // Load the data into the GPU

    let bufferId = gl.createBuffer();
    gl.bindBuffer( gl.ARRAY_BUFFER, bufferId );
    gl.bufferData( gl.ARRAY_BUFFER, flatten(points), gl.STATIC_DRAW );

    // Associate out shader letiables with our data buffer

    let vPosition = gl.getAttribLocation( program, "vPosition" );
    gl.vertexAttribPointer( vPosition, 3, gl.FLOAT, false, 0, 0 );
    gl.enableVertexAttribArray( vPosition );

    render();
};


function render()
{
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
    gl.drawArrays( gl.POINTS, 0, points.length );
}
