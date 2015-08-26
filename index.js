var Request = require(__dirname + "/lib/Request");

module.exports = {

    /**
     * Create new Request object of specified type
     *
     * @param type {string} - the request type to create
     * @returns {object} - new Request object
     */
    new: function(type) {
        return new Request(type)
    }
}
