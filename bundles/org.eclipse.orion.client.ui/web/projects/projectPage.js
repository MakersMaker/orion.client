/*******************************************************************************
 * @license
 * Copyright (c) 2011, 2012 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html). 
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/
 
/*global define document */

define(['orion/bootstrap', 'orion/globalCommands', 'orion/selection', 'orion/commands', 'orion/fileClient', 'orion/searchClient', 'orion/progress', 'orion/operationsClient', 'orion/contentTypes',
	'projects/ProjectTree', 'projects/SFTPConfiguration', 'projects/ProjectNavigation', 'projects/ProjectData', 'projects/ProjectDataManager', 'orion/PageUtil'],
 
	function( mBootstrap, mGlobalCommands, mSelection, mCommands, mFileClient, mSearchClient, mProgress, mOperationsClient, mContentTypes, mProjectTree, SFTPConfiguration, ProjectNavigation, mProjectData, ProjectDataManager, PageUtil ){
		
		var serviceRegistry;
		var preferences;
		var commandService;
		var progressService;
		var contentTypeService;
		var fileClient;
		var projectDataManager;
		var myproject;
		var myworkspace;
		
		function addSubComponents( ){
			var sidePanel = document.getElementById( 'projectNavigation' );

			var projectTree = new ProjectNavigation( myproject, myworkspace, sidePanel, serviceRegistry, commandService, progressService, fileClient, contentTypeService, projectDataManager );
			
			var mainPanel = document.getElementById( 'SFTPConfiguration' );
			
			var configuration = new SFTPConfiguration( myproject, mainPanel, commandService, serviceRegistry, fileClient );	
		}
		
		function startProjectComponents( project, workspace, dataManager ){
		
			var titleArea = document.getElementById( 'titleArea');
			
			if(project){
				titleArea.innerHTML = '<strong>Project: </strong>' + project.name;
			}
			
			myproject = project;
			myworkspace = workspace;
			
			/* Check to make sure we have workingsets */
			
			if( project && !project.workingsets ){
				project.workingsets = [];
				project.workingsets.push( project.workspace );
				dataManager.save( project, addSubComponents );
			}else{
				addSubComponents();
			}
		}
		
		mBootstrap.startup().then(
		
		function(core) {
		
			/* Render the page */
			
			serviceRegistry = core.serviceRegistry;
			
			preferences = core.preferences;
		
			var selection = new mSelection.Selection(serviceRegistry);

			commandService = new mCommands.CommandService({serviceRegistry: serviceRegistry, selection: selection});

			var operationsClient = new mOperationsClient.OperationsClient(serviceRegistry);
			
			progressService = new mProgress.ProgressService(serviceRegistry, operationsClient);
			
			fileClient = new mFileClient.FileClient( serviceRegistry );			
					
			contentTypeService = new mContentTypes.ContentTypeService(serviceRegistry);

			var searcher = new mSearchClient.Searcher({serviceRegistry: serviceRegistry, commandService: commandService, fileService: fileClient});
			
			mGlobalCommands.generateBanner("orion-projects", serviceRegistry, commandService, preferences, searcher );			
			
			var projectName = PageUtil.matchResourceParameters();

			/* Create the content */
			projectName = projectName.resource.split('=')[1];
			
			projectDataManager = new ProjectDataManager(serviceRegistry, fileClient);
			
			projectDataManager.getProject( projectName, startProjectComponents );
		});
	}	
);