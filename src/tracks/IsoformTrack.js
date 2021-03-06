import * as d3 from "d3";
import { countIsoforms, findRange, checkSpace, calculateNewTrackPosition } from '../RenderFunctions';
import { ApolloService } from '../services/services';

export default class IsoformTrack{ 

    constructor(viewer, track, height, width){
        this.trackData = {};
        this.viewer = viewer;
        this.width = width;
        this.height = height;
        this.getTrackData(track);
    }
    // Draw our track on the viewer
    // TODO: Potentially seperate this large section of code
    // for both testing/extensibility
    DrawTrack()
    {
        let viewer = this.viewer;
        let data = this.trackData;
        let width = this.width;
        let MAX_ROWS = 10;
        let calculatedHeight = 500;
    
        let UTR_feats= ["UTR","five_prime_UTR","three_prime_UTR"];
        let CDS_feats= ["CDS"];
        let exon_feats= ["exon"];
        let display_feats=["mRNA"];
        let dataRange = findRange(data,display_feats);
    
        let view_start = dataRange.fmin;
        let view_end = dataRange.fmax;
        let exon_height = 10; // will be white / transparent
        let cds_height = 10; // will be colored in
        let isoform_height = 40; // height for each isoform
        let isoform_title_height = 0; // height for each isoform
        let utr_height = 10; // this is the height of the isoform running all of the way through
        let transcript_backbone_height = 4; // this is the height of the isoform running all of the way through
        let arrow_height = 20;
        let arrow_width = 10;
        let arrow_points = '0,0 0,' + arrow_height + ' ' + arrow_width + ',' + arrow_width;

        let x = d3.scaleLinear()
            .domain([view_start, view_end])
            .range([0, width]);
        
        // Calculate where this track should go and translate it
        let newTrackPosition = calculateNewTrackPosition(this.viewer);
        let track = viewer.append("g").attr('transform', 'translate(0,' + newTrackPosition + ')').attr("class", "track");
            
        //need to build a new sortWeight since these can be dynamic
        let sortWeight = {};
        for(var i=0,len = UTR_feats.length; i <len; i++){
            sortWeight[UTR_feats[i]]=200;
        }
        for(var i=0,len = CDS_feats.length; i <len; i++){
            sortWeight[CDS_feats[i]]=1000;
        }
        for(var i=0,len = exon_feats.length; i <len; i++){
            sortWeight[exon_feats[i]]=100;
        }
    
        //Testing if the countIsoforms function is broked
        //let numberIsoforms =2;
        let numberIsoforms = countIsoforms(data);
        if (numberIsoforms > MAX_ROWS) {
            calculatedHeight = (MAX_ROWS + 2) * isoform_height;
        }
        else {
            calculatedHeight = (numberIsoforms + 1) * isoform_height;
        }
    
        let row_count =0;
        let used_space = [];
        let fmin_display=-1;
        let fmax_display=-1;
        // **************************************
        // FOR NOW LETS FOCUS ON ONE GENE ISOFORM
        // **************************************
        let feature = data[0];
        let featureChildren = feature.children;
        if (featureChildren) {

            let selected = feature.selected;

            //do I need this?
            let maxRows = MAX_ROWS;
            
            //May want to remove this and add an external sort function
            //outside of the render method to put certain features on top.
            featureChildren = featureChildren.sort(function (a, b) {
                if (a.name < b.name) return -1;
                if (a.name > b.name) return 1;
                return a - b;
            });

            // For each isoform..
            featureChildren.forEach(function (featureChild) {
                //
                let featureType = featureChild.type;
                
                if (display_feats.indexOf(featureType)>=0) {
                    //function to assign row based on available space.
                    // *** DANGER EDGE CASE ***/
                    let current_row = checkSpace(used_space, x(featureChild.fmin), x(featureChild.fmax));

                    if (current_row < maxRows) {
                        // An isoform container
                        let isoform = track.append("g").attr("class", "isoform")
                        .attr("transform","translate(0," + ((row_count * isoform_height) + 10) +")")

                        isoform.append("polygon")
                            .datum(function(){
                                return {fmin: featureChild.fmin, fmax: featureChild.fmax, strand:feature.strand};
                            })
                            .attr('class', 'transArrow')
                            .attr('points', arrow_points)
                            .attr('transform', function (d) {
                                if (feature.strand > 0) {
                                    return 'translate(' + Number(x(d.fmax)) + ',0)';
                                }
                                else {
                                    return 'translate('+Number(x(d.fmin))+',0) rotate(180)';
                                }
                            });

                        isoform.append('rect')
                            .attr('class', 'transcriptBackbone')
                            .attr('y', 10 + isoform_title_height)
                            .attr('height', transcript_backbone_height)
                            .attr("transform","translate(" + x(featureChild.fmin) + ",0)")
                            .attr('width', x(featureChild.fmax) - x(featureChild.fmin))
                            .datum({fmin: featureChild.fmin,fmax: featureChild.fmax});

                        var text_label = isoform.append('text')
                            .attr('class', 'transcriptLabel')
                            .attr('fill', selected ? 'sandybrown' : 'gray')
                            .attr('opacity', selected ? 1 : 0.5)
                            .attr('height', isoform_title_height)
                            .attr("transform","translate(" + x(featureChild.fmin) + ",0)")
                            .text(featureChild.name + " (" + feature.name + ")")
                            .datum({fmin:featureChild.fmin});

                        //Now that the label has been created we can calculate the space that
                        //this new element is taking up making sure to add in the width of
                        //the box.
                        var text_width = text_label.node().getBBox().width;
                        //First check to see if label goes past the end
                        if (Number(text_width+x(featureChild.fmin))>width){
                            console.log(featureChild.name+" goes over the edge");
                        }
                        let feat_end;
                        if(text_width>x(featureChild.fmax)-x(featureChild.fmin)){
                            feat_end=x(featureChild.fmin)+text_width;
                        }
                        else {
                            feat_end=x(featureChild.fmax);
                        }

                        //This is probably not the most efficent way to do this.
                        //Making an 2d array... each row is the first array (no zer0)
                        //next level is each element taking up space.
                        //Also using colons as spacers seems very perl... maybe change that?
                        // *** DANGER EDGE CASE ***/
                        if (used_space[current_row]){
                            let temp = used_space[current_row];
                            temp.push(x(featureChild.fmin)+":"+feat_end);
                            used_space[current_row]= temp;
                        }
                        else {
                            used_space[current_row]=[x(featureChild.fmin)+":"+feat_end]
                        }

                        //Now check on bounds since this feature is displayed
                        //The true end of display is converted to bp.
                        if(fmin_display < 0 ||fmin_display > featureChild.fmin){
                            fmin_display = featureChild.fmin;
                        }
                        if(fmax_display<0 || fmax_display < featureChild.fmax){
                            fmax_display = featureChild.fmax;
                        }

                        // have to sort this so we draw the exons BEFORE the CDS
                        featureChild.children = featureChild.children.sort(function (a, b) {

                            let sortAValue = sortWeight[a.type];
                            let sortBValue = sortWeight[b.type];

                            if (typeof sortAValue == 'number' && typeof sortBValue == 'number') {
                                return sortAValue - sortBValue;
                            }
                            if (typeof sortAValue == 'number' && typeof sortBValue != 'number') {
                                return -1;
                            }
                            if (typeof sortAValue != 'number' && typeof sortBValue == 'number') {
                                return 1;
                            }
                            // NOTE: type not found and weighted
                            return a.type - b.type;
                        });

                        featureChild.children.forEach(function (innerChild) {
                            let innerType = innerChild.type;
                            if (exon_feats.indexOf(innerType)>=0) {
                                isoform.append('rect')
                                    .attr('class', 'exon')
                                    .attr('x', x(innerChild.fmin))
                                    .attr('transform', 'translate(0,' + (exon_height - transcript_backbone_height ) + ')')
                                    .attr('height', exon_height)
                                    .attr('z-index', 10)
                                    .attr('width', x(innerChild.fmax) - x(innerChild.fmin))
                                    .datum({fmin: innerChild.fmin,fmax: innerChild.fmax});
                            }
                            else if (CDS_feats.indexOf(innerType)>=0) {
                                isoform.append('rect')
                                    .attr('class', 'CDS')
                                    .attr('x', x(innerChild.fmin))
                                    .attr('transform', 'translate(0,' +  (cds_height - transcript_backbone_height) + ')')
                                    .attr('z-index', 20)
                                    .attr('height', cds_height)
                                    .attr('width', x(innerChild.fmax) - x(innerChild.fmin))
                                    .datum({fmin: innerChild.fmin,fmax: innerChild.fmax});
                            }
                            else if (UTR_feats.indexOf(innerType)>=0) {
                                isoform.append('rect')
                                    .attr('class', 'UTR')
                                    .attr('x', x(innerChild.fmin))
                                    .attr('transform', 'translate(0,' + (utr_height - transcript_backbone_height ) + ')')
                                    .attr('z-index', 20)
                                    .attr('height', utr_height)
                                    .attr('width', x(innerChild.fmax) - x(innerChild.fmin))
                                    .datum({fmin: innerChild.fmin,fmax: innerChild.fmax});
                            }
                        });
                        row_count += 1;
                    }
                    else if (current_row == maxRows) {
                        // *** DANGER EDGE CASE ***/
                        ++current_row;
                        track.append('a')
                            .attr('class', 'transcriptLabel')
                            .attr('xlink:show', 'new')
                            .append('text')
                            .attr('x', x(feature.fmin) + 30)
                            .attr('fill', 'red')
                            .attr('opacity', 1)
                            .attr('height', isoform_title_height)
                            .text('Maximum features displayed.  See full view for more.');
                    }
                }
            });
        }

        if (row_count == 0) {
            track.append('text')
                .attr('x', 30)
                .attr('y', isoform_title_height + 10)
                .attr('fill', 'orange')
                .attr('opacity', 0.6)
                .text('Overview of non-coding genome features unavailable at this time.');
    
        }
  }

  /* Method for isoformTrack service call */
  getTrackData(track)
  {
    let externalLocationString = track["chromosome"] + ':' + track["start"] + '..' + track["end"];
    var dataUrl = track["url"][0] + encodeURI(track["genome"]) + track["url"][1] + encodeURI(externalLocationString) + track["url"][2];
    let apolloService = new ApolloService()
    apolloService.GetIsoformTrack(dataUrl).then((data) =>{
            this.trackData = data;
            this.DrawTrack();
    }); 
  }
}