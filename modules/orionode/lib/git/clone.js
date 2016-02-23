/*******************************************************************************
 * Copyright (c) 2012 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html). 
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/
/*eslint-env node */
/*eslint no-console:1*/
var api = require('../api'), writeError = api.writeError;
var git = require('nodegit');
var path = require("path");
var fs = require('fs');
var async = require('async');

function getClone(workspaceDir, fileRoot, req, res, next, rest) {
	var repos = [];
	
	var rootDir;
	var segments = rest.split("/");
	if (segments[1] === "workspace") {
		rootDir = workspaceDir;
	} else if (segments[1] === "file") {
		rootDir = api.join(workspaceDir, segments.slice(2).join("/"));
	}
		
	checkDirectory(rootDir, function(err) {
		if (err) return writeError(403, res, err.message);
		var resp = JSON.stringify({
			"Children": repos,
			"Type": "Clone"
		});

		res.statusCode = 200;
		res.setHeader('Content-Type', 'application/json');
		res.setHeader('Content-Length', resp.length);
		res.end(resp);	
	});

	function checkDirectory(dir, cb) {
		//Check if the dir is a directory
		fs.lstat(dir, function(err, stat) {
			if (err || !stat.isDirectory()) return cb(err);
			var base = path.basename(dir);
			git.Repository.open(dir)
			.then(function(repo) {
				var location = api.join(fileRoot, dir.replace(workspaceDir + "/", ""));
				var repoInfo = {
					"BranchLocation": "/gitapi/branch" + location,
					"CommitLocation": "/gitapi/commit" + location,
					"ConfigLocation": "/gitapi/config/clone" + location,
					"ContentLocation": location,
					"DiffLocation": "/gitapi/diff/Default" + location,
					"HeadLocation": "/gitapi/commit/HEAD" + location,
					"IndexLocation": "/gitapi/index" + location,
					"Location": "/gitapi/clone" + location,
					"Name": base,
					"RemoteLocation": "/gitapi/remote" + location,
					"StashLocation": "/gitapi/stash" + location,
					"StatusLocation": "/gitapi/status" + location,
					"TagLocation": "/gitapi/tag" + location,
					"Type": "Clone"
				};

				repo.getRemotes()
				.then(function(remotes){
					async.each(remotes, function(remote, callback) {
						if (remote === "origin") {
							repo.getRemote(remote)
							.then(function(remote){
								repoInfo.GitUrl = remote.url();
								callback();
							});
						} else {
							callback();
						}
					}, function(err) {
						repos.push(repoInfo);
						return cb();	
					});
				});
	 		})
			.catch(function(err) {
				fs.readdir(dir, function(err, files) {
					if (err) {
						return cb(err);
					}

					files = files.map(function(file) {
						return path.join(dir, file);
					});
					async.each(files, checkDirectory, cb);
				});
			});
		});
	}
}

function postInit(workspaceDir, fileRoot, req, res, next, rest) {
	if (req.body.GitUrl) {
		postClone(workspaceDir, fileRoot, req, res, next, rest);
	} else {
		var initDir = workspaceDir + '/' + req.body.Name;
		var theRepo, index, author, committer;

	    fs.mkdir(initDir, function(err){
			if (err) {
		    	return writeError(409, res);
	        }

	        git.Repository.init(initDir, 0)
		    .then(function(repo) {
		    	theRepo = repo;
		    	return repo;
		    })
		    .then(function(repo){
				return repo.openIndex();
			})
			.then(function(idx) {
				index = idx;
				index.read(1);
			})
			.then(function() {
				return index.writeTree();
			})
			.then(function(oid) {
				author = git.Signature.default(theRepo);	
				committer = git.Signature.default(theRepo);

				// Since we're creating an inital commit, it has no parents. Note that unlike
				// normal we don't get the head either, because there isn't one yet.
				return theRepo.createCommit("HEAD", author, committer, "Initial commit", oid, []);
			})
			.then(function(id) {
				var response = {
			       	"Location": "/gitapi/clone/file/" + req.body.Name
			    }
			    var resp = JSON.stringify(response)
			    res.statusCode = 201;
				res.setHeader('Content-Type', 'application/json');
				res.setHeader('Content-Length', resp.length);
				res.end(resp);

		    })
		    .catch(function(err){
		    	console.log(err);
		    	writeError(403, res);
		    });

	    });
	}
}

function putClone(workspaceDir, fileRoot, req, res, next, rest) {
	var segments = rest.split("/");
	if (!(segments[1] === "file" && segments.length > 2)) {
		return writeError(404, res);
	}

	var paths = req.body.Path;
	var branch = req.body.Branch;
	var tag = req.body.Tag;
	var removeUntracked = req.body.RemoveUntracked;
	if ((!paths || !paths.length) && !branch && !tag) {
		return writeError(400, "Invalid parameters");
	}

	var repoPath = segments[2];
	repoPath = api.join(workspaceDir, repoPath);
	var theRepo, theRef, theCommit;
	var checkOptions = {
		checkoutStrategy: git.Checkout.STRATEGY.FORCE,
	};
	git.Repository.open(repoPath)
	.then(function(repo) {
		theRepo = repo;
		if (paths) {
			//TODO: handle untracked files
			checkOptions.paths = paths;
			return git.Checkout.head(theRepo, checkOptions);
		} else if (tag && typeof(branch) === "string") {
			if (!branch) {

				return git.Reference.lookup(theRepo, "refs/tags/" + tag)
				.then(function(reference) {
					theRef = reference;
					return theRepo.getReferenceCommit(reference);
				})
				.then(function(commit) {
					theCommit = commit;
				 	return git.Checkout.tree(theRepo, commit, checkOptions);
				})
				.then(function() {
					return theRepo.setHeadDetached(theCommit);
				});
			} else {
				theRepo.checkoutBranch(branch, checkOptions);
			}
		} else {
			return theRepo.checkoutBranch(branch, checkOptions);
		}
	})
	.then(function(result){
		res.statusCode = 200;
		res.end();
	})
	.catch(function(err){
    	writeError(403, res);
    });
}

function postClone(workspaceDir, fileRoot, req, res, next, rest) {
	var url = req.body.GitUrl;
	var dirName = url.substring(url.lastIndexOf("/") + 1).replace(".git", "")

	git.Clone.clone(url, path.join(workspaceDir, dirName),
		{
    		remoteCallbacks: {
	        	certificateCheck: function() {
	        		return 1; //Ignore SSL certificate check
        		}
        	}
		})
	.then(function() {
		// I think clone will return when it finishes cloning, so we just give it a fake task and 100%
		var resp = JSON.stringify({
			"Id": "11111",
			"Location": "/task/id/THISISAPLACEHOLDER",
			"Message": "Cloning " + workspaceDir + " @ " + url,
			"PercentComplete": 100,
			"Running": false
		});

		res.statusCode = 201;
		res.setHeader('Content-Type', 'application/json');
		res.setHeader('Content-Length', resp.length);
		res.end(resp);
	})
	.catch(function(err) {
		// some kind of error with cloning a repo
		console.log("POST git/clone: failure!");
		console.log(err);
		writeError(403, res);
	});
}

module.exports = {
	getClone: getClone,
	postClone: postClone,
	postInit: postInit,
	putClone: putClone	
};
