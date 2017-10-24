/* Takes branches output from GitSwarm and prints out the name
   of each branch. Could do this with jq, but our build
   machines don't have it */

var branchNames = [];
try {
    var branches = JSON.parse(process.argv[2]);

    branches.map(function(branch) {
        branchNames.push(branch.name);
    });
}
catch (err) {
    console.log(err);
}

console.log(branchNames.join(" "));