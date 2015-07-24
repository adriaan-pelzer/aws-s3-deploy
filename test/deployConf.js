module.exports = {
    prod: {
        Bucket: 'test-s3-deploy',
        Folder: 'testFolder',
        Omit: [
            'deployConf.js'
        ],
        data: {
            key1: "production1",
            key2: "production2"
        }
    },
    staging: {
        Bucket: 'test-s3-deploy',
        Folder: 'testFolder2',
        Omit: [
            'deployConf.js'
        ],
        data: {
            key1: "staging1",
            key2: "staging2"
        }
    }
};
