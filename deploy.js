#!/usr/bin/env node

var aws = require ( 'aws-sdk' ), s3 = new aws.S3 ( { region: 'eu-west-1' } ), cf = new aws.CloudFront ( { region: 'eu-west-1' } );
var H = require ( 'highland' );
var R = require ( 'ramda' );
var path = require ( 'path' );
var fs = require ( 'fs' );
var rr = require ( 'recursive-readdir' );
var W = require ( 'highland-wrapcallback' );
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

var invalidate = R.curry ( function ( cdnId, s3Parms ) {
    return R.isNil ( cdnId ) ? H ( [ null ] ) : W ( cf, 'createInvalidation' )( {
        DistributionId: cdnId,
        InvalidationBatch: {
            CallerReference: new Date ().valueOf () + '/' + s3Parms.Key,
            Paths: {
                Quantity: 1,
                Items: [
                    '/' + s3Parms.Key
                ]
            }
        }
    } );
} );

var invalidateBatch = R.curry ( function ( cdnId, s3Keys ) {
    return R.isNil ( cdnId ) ? H ( [ null ] ) : W ( cf, 'createInvalidation' )( {
        DistributionId: cdnId,
        InvalidationBatch: {
            CallerReference: new Date ().valueOf () + '/' + Math.floor ( Math.random () * 65535 ),
            Paths: {
                Quantity: s3Keys.length,
                Items: R.map ( R.add ( '/' ), s3Keys )
            }
        }
    } );
} );

var cwd = process.argv[3] || './';

H ( [ path.resolve ( path.join ( cwd, 'deployConf.js' ) ) ] )
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
        return H ( [ path.resolve ( cwd ) ] )
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
                            .invoke ( 'replace', [ path.resolve ( cwd ) + path.sep, '' ] )
                            .map ( R.replace ( /\\/g, '/' ) )
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
                    .map ( function ( s3Parms ) {
                        return W ( s3, 'putObject' )( s3Parms )
                            .flatMap ( H.wrapCallback ( function ( result, callBack ) {
                                if ( result.ETag ) {
                                    console.log ( filename + ' uploaded successfully' );
                                    return callBack ( null, s3Parms.Key );
                                }

                                console.error ( filename + ' could not be uploaded' );
                                return callBack ( null, null );
                            } ) )
                            .reject ( R.isNil );
                    } )
                    .parallel ( 100 );
            } )
            .collect ()
            .flatMap ( invalidateBatch ( config.cdnId ) )
            .flatMap ( H.wrapCallback ( function ( result, callBack ) {
                if ( R.isNil ( result ) ) {
                    return callBack ( null, 'no invalidation needed' );
                } else if ( result.Invalidation && ( result.Invalidation.Status === 'InProgress' ) ) {
                    return callBack ( null, 'Files invalidated successfully' );
                } else {
                    return callBack ( 'Invalidation failed' );
                }
            } ) );
    } )
    .errors ( R.compose ( R.unary ( console.error ), R.add ( 'ERROR: ' ) ) )
    .each ( console.log );
