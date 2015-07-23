module.exports = {
    prod: {
        Bucket: 'test-s3-deploy',
        Folder: 'testFolder',
        Omit: [
            'deployConf.js'
        ]
    },
    staging: {
        Bucket: 'test-s3-deploy',
        Folder: 'testFolder2',
        Omit: [
            'deployConf.js'
        ]
    }
};
