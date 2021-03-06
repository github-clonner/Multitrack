var mongo = require('./manageMongo');
var ObjectID = require('mongodb').ObjectId;
var mixDB = require('./mixDB');
var userDB = require('./userDB');

var inputValidator = require('./inputValidator');

var commentCollection = "comment";


module.exports = {

    /**
     * Set the database name
     *
     * name is the name of the new database
     **/
    setDB: function(name){
        mongo.setDB(name);
    },

    //give the mix collection name
    getCommentDB: function(){
        return commentCollection;
    },

    getCommentsByMixId: function(mixId,callback){
	if (!ObjectID.isValid(mixId)) {
            callback({
                statusCode : 400,
                errorMessage : "Mix id is invalid"
            });
        }
	else{
	    mongo.findDocumentsByFilter( { mix_id : mixId },commentCollection,function(err,results){
		if(err){
		    callback(err);
		}
		else if(results.length == 0){
		    callback({
			statusCode : 400,
			errorMessage : "Invalid ID, no matching found"
		    });
		}
		else{
		    callback(null,results);
		}
	    });
	}
    },

    getUserComments: function(userId,callback){
	if (!ObjectID.isValid(userId)) {
            callback({
                statusCode : 400,
                errorMessage : "User id is invalid"
            });
        }
	else{
	    user.getUserById(userId,function(err,user1){
		if(err){
		    callback(err);
		}
		else if(results.length != 1){
		    callback({
			errorMessage : "Invalid ID, no matching found"
		    });
		}
		else{
		    callback(null,user1.comments);
		}
	    });
	}
    },

    createUserComment : function(connection, mixId, comment, rate, callback){
	if (!ObjectID.isValid(mixId)) {
            callback({
                statusCode : 400,
                errorMessage : "Mix id is invalid"
            });
        }
	else {
	    var com = {};
	    com.content = comment;
	    com.mix_id = mixId;
	    com.rate = rate;
	    var app = this;
	    userDB.getUser(connection,function(err,user1){
		if(err){
		    callback(err);
		}
		else{
		    com.user_id = user1._id.toString();
		    com.user_name = user1.name;
		    mongo.insertDocument(com,commentCollection,function(err,postedComment){
//		    app.createComment(com,function(err,postedComment){
			if(err){
			    callback(err);
			}
			else{
			    user1.comments.push(postedComment.insertedId);
			    userDB.updateUser(user1,function(err,results){
				if(err) {
				    callback(err);
				}
				else{
				    mixDB.getMixByID(mixId,function(err,mix1){
					if(err){
					    callback(err);
					}
					else{			    
					    mix1.comments.push(postedComment.insertedId);
					    mixDB.updateUserMix(connection,mix1,function(err,results){
						if(err){
						    callback(err);
						}
						else{
						    callback(null,postedComment);
						}
					    });
					}
				    })
				}
			    });
			}
		    });
		}
	    });
	}
    },


    createComment : function(comment, callback) {

        var commentValidation = inputValidator.validateComment(comment);
        if (!commentValidation.valid) {
            callback({
                statusCode : 400,
                errorMessage : commentValidation.errorMessages
            });
        }
        else if (!ObjectID.isValid(comment.mix_id)) {
            callback({
                statusCode : 400,
                errorMessage : "Mix id is invalid"
            });
        }
        else if (!ObjectID.isValid(comment.user_id)) {
            callback({
                statusCode : 400,
                errorMessage : "Comment id is invalid"
            });
        }
        //TODO : mettre à jour le champ updatedAt
        //Ici les champs sont valides
        else {
            mongo.insertDocument(comment, commentCollection, function(err, insertResults) {
                if (err) {
                    callback({
                        statusCode : 500,
                        errorMessage : err
                    });
                    return;
                }
                mixDB.getMixByID(comment.mix_id, function(err, mixToUpdate) {
                    if (err) {
                        callback({
                            statusCode : 500,
                            errorMessage : err
                        });
                        return;
                    }
                    mixToUpdate.comments.push(new ObjectID(String(insertResults.insertedId)));
                    mongo.updateDocument(mixToUpdate, mixDB.getMixDB(), function(err, updatedMix) {
                        if (err) {
                            callback(err);
                            return;
                        }
                        //TODO : ajouter le commentaire dans la collection "user"
                        callback(null, insertResults);
                    });
                });
            })
        }
    },

    /*
    get all comments with ids contained in "commentIds"
    commentIds : array of string Ids
    callback : executed at the end
     */
    getCommentsByIds : function(commentIds, callback) {
        var commentObjectIds = [];
        commentIds.forEach(function(stringId) {
            commentObjectIds.push(new ObjectID(stringId));
        });
        var filter = {"_id" : { $in : commentObjectIds }};
        mongo.findDocumentsByFilter(filter, commentCollection, function(err, results) {
            if (err) {
                callback({
                    statusCode : 500,
                    errorMessage : err
                });
            }
            else {
                callback(null, results);
            }
        });
    },

    removeComment : function(commentId, callback) {
        mongo.removeDocument(commentId, commentCollection, function(err, deleted) {
            if (err) {
                callback({
                    statusCode : 500,
                    errorMessage : err
                });
            }
            else {
                var finished = [false, false];
                mongo.findDocumentsByFilter({comments : new ObjectID(commentId)}, mixDB.getMixDB(), function(err, mixes) {
                    if (mixes.length != 0) {
                        mixes[0].comments = mixes[0].comments.filter(function (element) {
                            return (element.toHexString() != commentId);
                        });
                        mongo.updateDocument(mixes[0], mixDB.getMixDB(), function (err, result) {
                            finished[0] = true;
                            if (finished[1]) {
                                if (err) {
                                    callback({
                                        statusCode: 500,
                                        errorMessage: err
                                    });
                                    return;
                                }
                                callback(null, deleted);
                            }
                        });
                    }
                    else {
                        finished[0] = true;
                        if (finished[1]) {
                            callback(null, deleted);
                        }
                    }
                });
                mongo.findDocumentsByFilter({comments : new ObjectID(commentId)}, "user", function(err, users) {
                    if (users.length != 0)  {
                        users[0].comments = users[0].comments.filter(function(element) {
                            return (element.toHexString() != commentId);
                        });
                        mongo.updateDocument(users[0], "user", function(err, result) {
                            finished[1] = true;
                            if (finished[0]) {
                                if (err) {
                                    callback({
                                        statusCode: 500,
                                        errorMessage: err
                                    });
                                    return;
                                }
                                callback(null, deleted);
                            }
                        });
                    }
                    else {
                        finished[1] = true;
                        if (finished[0]) {
                            callback(null, deleted);
                        }
                    }
                });
            }
        });
    },

    removeAllComments : function(callback) {
        mongo.removeAllDocuments(commentCollection, function(err, deleted) {
            if (err) {
                callback({
                    statusCode : 500,
                    errorMessage : err
                });
            }
            else {

                //TODO : Supprimer les commentaires dans les collections "mix" et "user"
                callback(null, deleted);
            }
        });
    },

    updateUserComment : function(updatedComment, callback) {
	if (!ObjectID.isValid(mixId)) {
            callback({
                statusCode : 400,
                errorMessage : "Mix id is invalid"
            });
        }
	else {
	    var com = {};
	    com.content = comment;
	    com.mix_id = mixId;
	    com.rate = rate;
	    var app = this;
	    userDB.getUser(connection,function(err,user1){
		if(err){
		    callback(err);
		}
		else{
		    com.user_id = user1._id.toString();
		    mongo.updateDocument(com,commentCollection,function(err,postedComment){
			if(err){
			    callback(err);
			}
			else{
			    user1.comments.push(postedComment.insertedId);
			    userDB.updateUser(user1,function(err,results){
				if(err) {
				    callback(err);
				}
				else{
				    mixDB.getMixByID(mixId,function(err,mix1){
					if(err){
					    callback(err);
					}
					else{			    
					    mix1.comments.push(postedComment.insertedId);
					    mixDB.updateUserMix(connection,mix1,function(err,results){
						if(err){
						    callback(err);
						}
						else{
						    callback(null,postedComment);
						}
					    });
					}
				    })
				}
			    });
			}
		    });
		}
	    });
	}

    }

};
