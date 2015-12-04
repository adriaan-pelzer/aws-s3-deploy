module.exports = {
    prod: {
        Bucket: 's3.eip.telegraph.co.uk',
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
        Bucket: 's3-staging.eip.telegraph.co.uk',
        cdnId: 'E2YWDG5C5WR01M',
        Folder: 'testFolder',
        Omit: [
            'deployConf.js'
        ],
        data: {
            key1: "staging1",
            key2: "staging2"
        }
    }
};
