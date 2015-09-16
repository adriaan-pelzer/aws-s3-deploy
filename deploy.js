#!/usr/bin/env node

var aws = require ( 'aws-sdk' ), s3 = new aws.S3 ( { region: 'eu-west-1' } );
var H = require ( 'highland' );
var R = require ( 'ramda' );
var path = require ( 'path' );
var fs = require ( 'fs' );
var rr = require ( 'recursive-readdir' );
var wrapCallback = require ( 'highland-wrapcallback' );
var mime = require ( 'mime' );
var handlebars = require ( 'handlebars' );
var glob = require ( 'glob' );

var errorIf = function ( pred, error ) {
    return H.wrapCallback ( function ( input, callBack ) {
        if ( pred ( input ) ) {
            return callBack ( error );
        }

        return callBack ( null, input );
    } );
};

H ( [ path.resolve ( './deployConf.js' ) ] )
    .flatMap ( function ( configFile ) {
        return H.wrapCallback ( function ( configFile, callBack ) {
            fs.exists ( configFile, function ( exists ) {
                if ( exists ) {
                    return callBack ( null, exists );
                }
                
                return callBack ( exists );
            } );
        } )( configFile )
            .flatMap ( errorIf ( R.isNil, "Config file does not exist" ) )
            .map ( R.always ( configFile ) )
    } )
    .map ( require )
    .map ( R.ifElse ( R.always ( R.isNil ( process.argv[2] ) ), R.identity, R.prop ( process.argv[2] ) ) )
    .flatMap ( function ( config ) {
        return H ( [ path.resolve ( './' ) ] )
            .flatMap ( H.wrapCallback ( function ( path, callBack ) {
                rr ( path, config.Omit || [], callBack );
            } ) )
            .sequence ()
            .flatFilter ( function ( filename ) {
                return H ( config.Omit )
                    .flatMap ( H.wrapCallback ( glob ) )
                    .collect ()
                    .map ( R.flatten )
                    .map ( R.map ( path.resolve ) )
                    .map ( R.contains ( filename ) )
                    .map ( R.not );
            } )
            .flatMap ( function ( filename ) {
                return H.wrapCallback ( fs.readFile )( filename )
                    .flatMap ( function ( Body ) {
                        return H ( [ filename ] )
                            .invoke ( 'replace', [ path.resolve ( './' ) + '/', '' ] )
                            .map ( R.add ( config.Folder ? ( config.Folder + '/' ) : '' ) )
                            .map ( function ( Key ) {
                                var body;

                                if ( config.data ) {
                                    try {
                                        body = handlebars.compile ( Body.toString ( 'utf8' ) )( config.data );
                                    } catch ( error ) {
                                        body = Body;
                                    }
                                } else {
                                    body = Body;
                                }

                                return {
                                    Bucket: config.Bucket,
                                    Key: Key,
                                    ACL: 'public-read',
                                    Body: body,
                                    ContentType: mime.lookup ( filename )
                                };
                            } );
                    } )
                    .flatMap ( wrapCallback ( s3, 'putObject' ) )
                    .flatMap ( H.wrapCallback ( function ( result, callBack ) {
                        if ( result.ETag ) {
                            return callBack ( null, filename + ' uploaded successfully' );
                        }

                        return callBack ( filename + ' could not be uploaded' );
                    } ) );
            } );

    } )
    .errors ( R.compose ( R.unary ( console.error ), R.add ( 'ERROR: ' ) ) )
    .each ( console.log );
