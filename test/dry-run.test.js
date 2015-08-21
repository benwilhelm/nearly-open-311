var cwd = process.cwd();
var async = require('async');
var req311 = require(cwd + "/index");

describe("module", function(){

  it("dry run", function(done){

    var opts = {
      requestType: "AAE",
      streetNumber: 4955,
      streetDirection: "N",
      streetName: "Damen",
      streetSuffix: "Ave"
    }
    var r311 = req311();
    async.series([
      function(next){
        r311.initialize(opts, next)
      },
      function(next){
        r311.setFormData({
          fn_AAE_ISTHEPOO: "Rainwater"
        })

        r311.setContactData({
          emailAddress: "test@test.com"
        })

        r311.verify(function(err, res, txt){
          console.log(arguments);
          next(err, txt)
        })
      }
    ], function(err, rslt){
      console.log(rslt[1]);
      done();
    })

  })
})
