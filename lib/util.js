module.exports = {

    /**
     * Takes a US phone number of unknown format and returns a uniform string of ten digits
     * or false if it could not be parsed.
     *
     * @param input {string} - The phone number to be normalized
     * @returns {string} - a 10-digit string (ie. 3125551212)
     */
    normalizePhone: function(input) {
        input = input+'';
        input = input.replace(/\D/g, "");   // remove non-numeric characters
        input = input.replace(/^1/, "");    // remove leading 1 if present

        // check that remainder is 10 digits
        var match = input.match(/^\d{10}$/);

        if (!match) {
            return false;
        }

        return match[0]
    },


    /**
     * A very permissive email validator.  Mostly just a sanity check.
     *
     * @param address {string} - the email address to check
     * @returns {boolean} - whether the email is valid(ish)
     */
    isEmail: function(address) {
        return address && !!address.match(/^(.+)@(.+)\.(.+)$/)
    }

}
