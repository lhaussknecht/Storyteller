var Postal = require('postal');
var Specification = require('./specification');
var SpecificationStore = require('./specification-store');
var Hierarchy = require('./specs/hierarchy');

function applyOutstandingChanges(){
	// If any thing is open, pack it in now
	Postal.publish({
		channel: 'editor',
		topic: 'apply-changes',
		data: {}
	});
}

class EditorPresenter{
	constructor(spec){
		if (spec instanceof Specification || spec.id){
			this.id = spec.id;
			this.spec = spec;
		}
		else{
			this.id = spec;
		}


		this.latched = false;
		this.subscriptions = [];
	}




	deactivate(){
		this.subscriptions.forEach(function(x){
			x.unsubscribe();
		});
	}

	enableUndoButtons(){
		if (this.spec != null){
			var counts = this.spec.changeStatus();
			var state = {
				undoEnabled: (counts.applied > 0),
				redoEnabled: (counts.unapplied > 0)
			}

			this.view.setState(state);
		}
		else {
			this.view.setState({
				undoEnabled: false,
				redoEnabled: false
			});
		}
	}


	refreshEditor(){
		if (this.spec){
			this.view.setState({
				spec: this.spec,
				activeContainer: this.spec.activeHolder,
				components: this.loader.buildComponents(this.spec),
				outline: this.spec.outline(),
				loading: false,
				header: Hierarchy.findSpec(this.id)
			});
		}
		else{
			this.view.setState({
				loading: true
			});
		}


	}

	subscribe(topic, callback){
		this.subscriptions.push(Postal.subscribe({
			channel: 'editor',
			topic: topic,
			callback: callback
		}));
	}

	initializeData(){
		if (SpecificationStore.hasData(this.id)){
			this.spec = SpecificationStore.getData(this.id);
			this.refreshEditor();
			this.enableUndoButtons();
		}
		else{
			this.view.setState({loading: true, spec: this.specHeader});
			SpecificationStore.requestData(this.id);
		}
	}


	activate(loader, view){
		if (view == null || view == undefined){
			throw new Error('Must pass the view component here');
		}

		this.loader = loader;
		this.view = view;
		this.specHeader = Hierarchy.findSpec(this.id);

		var self = this;

		this.subscribe('spec-results-changed', function(data){
			if (data.id == self.id){
				self.spec = SpecificationStore.getData(self.id);
				self.refreshEditor();
			}
		});

		this.subscribe('spec-data-invalidated', function(data){
			if (data.id == self.id){
				self.initializeData();
			}
		});

		this.subscribe('spec-data-available', function(data){
			if (data.id == self.id){
				self.initializeData();
			}
		});

		this.subscribe('select-cell', function(data, envelope) {
			if (!data.step){
				return;
			}

	        self.selectCell(data);
	    });

	    this.subscribe('select-holder', function(data, envelope) {
			if (!data.holder){
				return;
			}

	        self.selectHolder(data);
	    });

	    this.subscribe('changes', function(data, envelope) {
	        self.applyChange(data);
	    });

	    this.subscribe('add-step', function(data, envelope) {
	        self.applyChange(data);
	        self.refreshEditor();
	    });

	    this.subscribe('remove-step', function(data, envelope) {
	        self.applyChange(data);
	        self.refreshEditor();
	    });

	    this.subscriptions.push(Postal.subscribe({
	    	channel: 'engine',
	    	topic: 'spec-body-saved',
	    	callback: function(data){
	    		self.specBodySaved(data);
	    	}
	    }));


	    if (this.spec){
			this.enableUndoButtons();
			this.refreshEditor();
			this.view.setState({spec: this.specHeader})
	    }
	    else{
	    	this.initializeData();
	    }



	}

	save(){
		applyOutstandingChanges();

		var message = {
			type: 'save-spec-body', 
			id: this.spec.id, 
			spec: this.spec.write(), 
			revision: this.spec.revision()
		};

		Postal.publish({
			channel: 'engine-request',
			topic: 'save-spec-body',
			data: message
		});

		this.view.setState({persisting: true});
	}

	run(){
		applyOutstandingChanges();

		Postal.publish({
			channel: 'engine-request',
			topic: 'run-spec',
			data: {id: this.id, spec: this.spec.pack()}
		});

		this.view.gotoResults();
	}

	selectCell(data){
		applyOutstandingChanges();

		this.spec.selectCell(data.step, data.cell);

		this.refreshEditor();
	}

	selectHolder(data){
		this.spec.selectHolder(data.holder);

		this.refreshEditor();
	}

	applyChange(data){
		this.spec.apply(data);
		this.enableUndoButtons();
	}

	undo(){
		this.spec.undo();
		this.enableUndoButtons();
		this.refreshEditor();
	}

	redo(){
		this.spec.redo();
		this.enableUndoButtons();
		this.refreshEditor();
	}

	specBodySaved(data){
		if (data.id != this.spec.id) return;

		this.spec.baselineAt(data.revision);


		// TODO -- maybe find a way to combine the folling two calls
		// for performance
		this.view.setState({
			lastSaved: data.time,
			persisting: false
		});

		this.enableUndoButtons();
	}



}





module.exports = EditorPresenter;