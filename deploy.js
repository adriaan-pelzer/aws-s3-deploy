#!/usr/bin/env node

var aws = require ( 'aws-sdk' ), s3 = new aws.S3 ( { region: 'eu-west-1' } );
var H = require ( 'highland' );
var R = require ( 'ramda' );
var path = require ( 'path' );
var fs = require ( 'fs' );
var rr = require ( 'recursive-readdir' );
var wrapCallback = require ( 'highland-wrapcallback' );

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
            .flatMap ( errorIf ( R.isNil, "Config file does not existi" ) )
            .map ( R.always ( configFile ) )
    } )
    .map ( require )
    .flatMap ( function ( config ) {
        return H ( [ path.resolve ( './' ) ] )
            .flatMap ( H.wrapCallback ( function ( path, callBack ) {
                rr ( path, config.Omit || [], callBack );
            } ) )
            .sequence ()
            .flatMap ( function ( filename ) {
                return H.wrapCallback ( fs.readFile )( filename )
                    .flatMap ( function ( Body ) {
                        return H ( [ filename ] )
                            .invoke ( 'replace', [ path.resolve ( './' ) + '/', '' ] )
                            .map ( R.add ( config.Folder ? ( config.Folder + '/' ) : '' ) )
                            .map ( function ( Key ) {
                                return {
                                    Bucket: config.Bucket,
                                    Key: Key,
                                    ACL: 'public-read',
                                    Body: Body
                                };
                            } );
                    } );
            } );

    } )
    .flatMap ( wrapCallback ( s3, 'putObject' ) )
    .errors ( R.compose ( R.unary ( console.error ), R.add ( 'ERROR: ' ) ) )
    .each ( console.log );
