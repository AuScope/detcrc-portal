Ext.application({
    name : 'portal',

    //Here we build our GUI from existing components - this function should only be assembling the GUI
    //Any processing logic should be managed in dedicated classes - don't let this become a
    //monolithic 'do everything' function
    launch : function() {

        //Send these headers with every AJax request we make...
        Ext.Ajax.defaultHeaders = {
            'Accept-Encoding': 'gzip, deflate' //This ensures we use gzip for most of our requests (where available)
        };

        var urlParams = Ext.Object.fromQueryString(window.location.search.substring(1));
        var isDebugMode = urlParams.debug;

        //Create our CSWRecord store (holds all CSWRecords not mapped by known layers)
        var unmappedCSWRecordStore = Ext.create('Ext.data.Store', {
            model : 'portal.csw.CSWRecord',
            groupField: 'contactOrg',
            proxy : {
                type : 'ajax',
                url : 'getUnmappedCSWRecords.do',
                reader : {
                    type : 'json',
                    root : 'data'
                }
            },
            autoLoad : true
        });

        //Our custom record store holds layers that the user has
        //added to the map using a OWS URL entered through the
        //custom layers panel
        var customRecordStore = Ext.create('Ext.data.Store', {
            model : 'portal.csw.CSWRecord',
            proxy : {
                type : 'ajax',
                url : 'getCustomLayers.do',
                reader : {
                    type : 'json',
                    root : 'data'
                }
            },
            autoLoad : false,
            data : [],
            listeners : {
                load  :  function(store, records, successful, eopts){
                    if(!successful){
                        Ext.Msg.show({
                            title:'Error!',
                            msg: 'Either the URL is not valid or it does not conform to EPSG:4326 WMS layers standard',
                            buttons: Ext.Msg.OK
                        });
                    }else{
                        if(records.length === 0){
                            Ext.Msg.show({
                                title:'No WMS Layers!',
                                msg: 'There are no WMS Layers in the given URL',
                                buttons: Ext.Msg.OK
                            });
                        }
                    }
                }
            }
        });

        //Create our KnownLayer store
        var knownLayerStore = Ext.create('Ext.data.Store', {
            model : 'portal.knownlayer.KnownLayer',
            groupField: 'group',
            proxy : {
                type : 'ajax',
                url : 'getKnownLayers.do',
                reader : {
                    type : 'json',
                    root : 'data'
                }
            },
            autoLoad : true
        });

        // Create the ResearchDataLayer store
        var researchDataLayerStore = Ext.create('Ext.data.Store', {
            model : 'portal.knownlayer.KnownLayer',
            groupField: 'group',
            proxy : {
                type : 'ajax',
                url : 'getResearchDataLayers.do',
                reader : {
                    type : 'json',
                    root : 'data'
                }
            },
            autoLoad : true
        });

        //Create our store for holding the set of
        //layers that have been added to the map
        var layerStore = Ext.create('portal.layer.LayerStore', {});

        //We need something to handle the clicks on the map
        var queryTargetHandler = Ext.create('portal.layer.querier.QueryTargetHandler', {});

        //Create our map implementations
        var mapCfg = {
            container : null,   //We will be performing a delayed render of this map
            layerStore : layerStore,
            listeners : {
                query : function(mapWrapper, queryTargets) {
                    queryTargetHandler.handleQueryTargets(mapWrapper, queryTargets);
                }
            }
        };
        var urlParams = Ext.Object.fromQueryString(window.location.search.substring(1));
        var map = null;
        if (urlParams && urlParams.map && urlParams.map === 'googleMap') {
            map = Ext.create('portal.map.gmap.GoogleMap', mapCfg);
        } else {
            map = Ext.create('portal.map.openlayers.OpenLayersMap', mapCfg);
        }

        var layersPanel = Ext.create('portal.widgets.panel.LayerPanel', {
            title : 'Active Layers',
            region : 'center',
            store : layerStore,
            map : map,
            allowDebugWindow : isDebugMode,
            listeners : {
                //On selection, update our filter panel
                select : function(rowModel, record, index) {
                    filterPanel.showFilterForLayer(record);
                },
                removelayerrequest: function(sourceGrid, record) {
                    filterPanel.clearFilter();
                }
            }
        });

        /**
         * Used to show extra details for querying services
         */
        var filterPanel = Ext.create('portal.widgets.panel.FilterPanel', {
            title : 'Filter',
            region: 'south',
            layerPanel : layersPanel,
            map : map,
            split: true,
            height: 170
        });

        var layerFactory = Ext.create('portal.layer.LayerFactory', {
            map : map,
            formFactory : Ext.create('auscope.layer.filterer.AuScopeFormFactory', {map : map}),
            downloaderFactory : Ext.create('auscope.layer.AuScopeDownloaderFactory', {map: map}),
            querierFactory : Ext.create('auscope.layer.AuScopeQuerierFactory', {map: map}),
            rendererFactory : Ext.create('auscope.layer.AuScopeRendererFactory', {map: map})
        });

        //Utility function for adding a new layer to the map
        //record must be a CSWRecord or KnownLayer
        var handleAddRecordToMap = function(sourceGrid, record) {
            var newLayer = null;

            //Ensure the layer DNE first
            var existingRecord = layerStore.getById(record.get('id'));
            if (existingRecord) {
                layersPanel.getSelectionModel().select([existingRecord], false);
                return;
            }

            //Turn our KnownLayer/CSWRecord into an actual Layer
            if (record instanceof portal.csw.CSWRecord) {
                newLayer = layerFactory.generateLayerFromCSWRecord(record);
            } else {
                newLayer = layerFactory.generateLayerFromKnownLayer(record);
            }

            //We may need to show a popup window with copyright info
            var cswRecords = newLayer.get('cswRecords');
            for (var i = 0; i < cswRecords.length; i++) {
                if (cswRecords[i].hasConstraints()) {
                    var popup = Ext.create('portal.widgets.window.CSWRecordConstraintsWindow', {
                        width : 900,
                        height : 400,
                        cswRecords : cswRecords,
                        autoHeight : false
                    });
                    popup.show()

                    //HTML images may take a moment to load which stuffs up our layout
                    //This is a horrible, horrible workaround.
                    var task = new Ext.util.DelayedTask(function(){
                        popup.doLayout();
                    });
                    task.delay(1000);

                    break;
                }
            }

            layerStore.insert(0,newLayer); //this adds the layer to our store
            layersPanel.getSelectionModel().select([newLayer], false); //this ensures it gets selected
        };

        var knownLayersPanel = Ext.create('portal.widgets.panel.KnownLayerPanel', {
            title : 'Featured',
            store : knownLayerStore,
            map : map,
            tooltip : {
                anchor : 'top',
                title : 'Featured Layers',
                text : '<p1>This is where the portal groups data services with a common theme under a layer. This allows you to interact with multiple data providers using a common interface.</p><br><p>The underlying data services are discovered from a remote registry. If no services can be found for a layer, it will be disabled.</p1>',
                showDelay : 100,
                icon : 'img/information.png',
                dismissDelay : 30000
            },
            listeners : {
                addlayerrequest : handleAddRecordToMap
            }
        });

        var unmappedRecordsPanel = Ext.create('portal.widgets.panel.CSWRecordPanel', {
            title : 'Registered',
            store : unmappedCSWRecordStore,
            tooltip : {
                title : 'Registered Layers',
                text : 'The layers that appear here are the data services that were discovered in a remote registry but do not belong to any of the Featured Layers groupings.',
                showDelay : 100,
                dismissDelay : 30000
            },
            map : map,
            listeners : {
                addlayerrequest : handleAddRecordToMap
            }
        });

        var customRecordsPanel = Ext.create('portal.widgets.panel.CustomRecordPanel', {
            title : 'Custom',
            store : customRecordStore,
            tooltip : {
                title : 'Custom Data Layers',
                text : 'This tab allows you to create your own layers from remote data services.',
                showDelay : 100,
                dismissDelay : 30000
            },
            map : map,
            listeners : {
                addlayerrequest : handleAddRecordToMap
            }
        });

        var researchDataPanel = Ext.create('portal.widgets.panel.KnownLayerPanel', {
            title : 'Research Data',
            store : researchDataLayerStore,
            map : map,
            tooltip : {
                title : 'Research Data Layers',
                text : '<p1>The layers in this tab represent past/present research activities and may contain partial or incomplete information.</p1>',
                showDelay : 100,
                dismissDelay : 30000
            },
            listeners : {
                addlayerrequest : handleAddRecordToMap
            }
        });

        // basic tabs 1, built from existing content
        var tabsPanel = Ext.create('Ext.TabPanel', {
            title : 'Layers',
            activeTab : 0,
            region : 'north',
            split : true,
            height : 265,
            enableTabScroll : true,
            items:[knownLayersPanel,
                unmappedRecordsPanel,
                customRecordsPanel,
                researchDataPanel
            ]
        });

        /**
         * Used as a placeholder for the tree and details panel on the left of screen
         */
        var westPanel = {
            layout: 'border',
            region:'west',
            border: false,
            split:true,
            //margins: '100 0 0 0',
            margins:'100 0 0 3',
            width: 350,
            items:[tabsPanel , layersPanel, filterPanel]
        };

        /**
         * This center panel will hold the google maps instance
         */
        var centerPanel = Ext.create('Ext.panel.Panel', {
            region: 'center',
            id: 'center_region',
            margins: '100 0 0 0',
            cmargins:'100 0 0 0'
        });

        /**
         * Add all the panels to the viewport
         */
        var viewport = Ext.create('Ext.container.Viewport', {
            layout:'border',
            items:[westPanel, centerPanel]
        });

        map.renderToContainer(centerPanel);   //After our centerPanel is displayed, render our map into it

        //Create our permalink generation handler
        var permalinkHandler = function() {
            var mss = Ext.create('portal.util.permalink.MapStateSerializer');

            mss.addMapState(map);
            mss.addLayers(layerStore);

            var stateString = mss.serialize();

            var popup = Ext.create('portal.widgets.window.PermanentLinkWindow', {
                state : stateString
            });

            popup.show();
        };
        Ext.get('permalink').on('click', permalinkHandler);
        Ext.get('permalinkicon').on('click', permalinkHandler);

        //Handle deserialisation
        var deserializationHandler = Ext.create('portal.util.permalink.DeserializationHandler', {
            knownLayerStore : knownLayerStore,
            cswRecordStore : unmappedCSWRecordStore,
            layerFactory : layerFactory,
            layerStore : layerStore,
            map : map
        });
    }
});