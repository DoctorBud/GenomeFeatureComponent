"use strict"
import IsoformTrack from './tracks/IsoformTrack';
import ReferenceLabel from './tracks/ReferenceLabel';
import VariantTrack from './tracks/VariantTrack';
import * as d3 from "d3";
/*
*   Main Drawing class
*   @Param viewer: the entire viewer
*
*  Maybe this should just handle data and thats it.
*/
export default class Drawer {

    constructor(gfc)
    {
        this.gfc = gfc;
        this.used = 0;
        this.drag_cx = 0;
        this.drag_prev = 0;
        this.range = [];
    }

    async draw(){
        // Viewer Information
        let locale = this.gfc["locale"];
        let height = this.gfc["height"];
        let width  = this.gfc["width"];
        let viewer = this.gfc["viewer"];
        let tracks = this.gfc["tracks"];
        let svg_target = this.gfc["svg_target"];
        let draggingViewer = null;
        let draggingStart = null;

        if(locale == "local"){
            width  = document.body.clientWidth;
            // Other setup
            let labelOffset = 100;
            draggingViewer = evt => this.dragged(this);
            draggingStart = evt => this.drag_start(this);
            // Setting our clip path view to enable the scrolling effect
            d3.select(svg_target).append("defs").append("svg:clipPath").attr("id", "clip")
            .append("rect").attr("id","clip-rect")
            .attr("x", "0").attr("y", "0")
            .attr("height", height)
            .attr("width", this.gfc["width"] - labelOffset)
            .attr("transform", "translate(" + labelOffset + ",10)");
            viewer.attr("clip-path", "url(#clip)");

        }
        
        let options = this.gfc["config"];
        // Sequence information
        let sequenceOptions = this._configureRange(options["start"], options["end"])
        this.range = sequenceOptions["range"];
        let chromosome = options["chromosome"];
        let start = sequenceOptions["start"];
        let end = sequenceOptions["end"];

        // Draw our reference if it's local for now.
        // TODO: With a global config we want to create the reference here too.
        console.log("[GCLog] Drawing reference..");
        if(locale == "local"){
           const referenceTrack = new ReferenceLabel(viewer,  {"chromosome": chromosome, "start": start, "end": end, "range": sequenceOptions["range"]}, 
            height, width);
           await referenceTrack.getTrackData();
           referenceTrack.DrawTrack();
           viewer.call(d3.drag()
                .on("start",draggingStart )
                .on("drag", draggingViewer)
            );
        }

        // Always take the start end of our view.
        // TODO: Lock view to always have some number of sequence (50, 100)?
        console.log("[GFCLog] Drawing tracks..");
        tracks.forEach(async function(track) {
            track["start"] = start;
            track["end"] = end;
            track["chromosome"] = chromosome;
            if(track.type == "isoform")
            {
                new IsoformTrack(viewer, track, height, width);
            }
            else if(track.type == "variant")
            {
                track["range"] = sequenceOptions["range"];
                const variantTrack = new VariantTrack(viewer, track, height, width);
                await variantTrack.getTrackData();
                variantTrack.DrawTrack();
            }
            else
            {
                console.error("TrackType not found for " + track["id"] + "...");
            }
        });
    }

    // Trigger for when we start dragging. Save the intial point.
    drag_start(ref){
        ref.drag_cx = d3.event.x;
    }

    /*
        Trigger while we are dragging. Figure out the direction
        and get the amount to scroll by.

        @Param ref, a reference to the drawer class since event methods 
        scope of this becomes the element it triggers on.

    */
    dragged(ref){
        // Get tick size for our scroll value
        let scrollValue = parseInt(d3.select(".x-local-axis .tick").node().getBoundingClientRect().width) * 2;
        if(ref.drag_cx != d3.event.x){
            // Figure out which way the user wants to go.
            // 1 -> going up
            // -1 -> going 
            let direction = 0
            if(ref.drag_cx < d3.event.x){
                direction = 1;
            }else{
                direction = -1
            }
            ref.scrollView(direction, scrollValue)
            // Always want to compare next drag direction compared to previous to
            // enable smooth back and forth scrolling
            ref.drag_cx = d3.event.x; 
        }
    }

    /* 
        Function to scroll our local view
        @Param direction: The direction of the scroll
                1 -> going up
                -1 -> going down
        @Param scrollValue: The amount you want to move the view. 
                            Typically you get the tick size then multiply.
    */
    scrollView(direction, scrollValue)
    {
        let ref = this;
        // We want to move the track in a direction when dragging
        // thresholds for end of the sequence
        let dragThresh = {"maxNegative": this.gfc["width"] - ref.range[1]};
        // We are moving get our elements and translate them
        // the distance of a tick. 
        d3.selectAll(".track").attr("transform",function(){
            let trs = ref.getTranslate(d3.select(this).attr("transform"));
            let newX = 0;
            if(direction == 1)
            {
                newX = trs[0] + scrollValue; 
            }
            else if(direction == -1)
            {
                newX = trs[0] - scrollValue; 
            }
            // Want to make sure we don't go beyond our sequence length. Which is defined by our range.
            if( newX <= dragThresh["maxNegative"] || newX > -(ref.range[0]) + 100 )
            {
                return "translate(" + trs[0] +"," + trs[1] + ")";
            }

            return "translate(" + newX +"," + trs[1] + ")";
        });
    }

    // Nasty function to get translate values since d3 deprecated.
    getTranslate(transform) 
    {
        // Create a dummy g for calculation purposes only. This will never
        // be appended to the DOM and will be discarded once this function 
        // returns.
        var g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        
        // Set the transform attribute to the provided string value.
        g.setAttributeNS(null, "transform", transform);
        
        // consolidate the SVGTransformList containing all transformations
        // to a single SVGTransform of type SVG_TRANSFORM_MATRIX and get
        // its SVGMatrix. 
        var matrix = g.transform.baseVal.consolidate().matrix;
        
        // As per definition values e and f are the ones for the translation.
        return [matrix.e, matrix.f];
    }

    /* 
        Configure the range for our tracks two use cases
            1. Entered with a position
            2. TODO: Entered with a range start at 0?
    */
    _configureRange(start, end)
    {
        let sequenceLength = null;
        let desiredScaling = 17 ; // most optimal for ~50bp in the view.
        let rangeWidth = 0;
        let range = [0, 0];

        // We have entered with a variant position
        // create our sequence 'padding'
        // ex. position 20, we want total 100 nucelotides
        // (20 - 49) & (50 + 20) 
        if(start == end )
        {
            sequenceLength = 300; // hardcode 150 to each end.
            rangeWidth = desiredScaling * sequenceLength;
            start = start - (sequenceLength / 2) - 1;
            end = end + (sequenceLength / 2);
            // Plus 100 for the label offset.
            let middleOfView  = (d3.select('#clip-rect').node().getBoundingClientRect().width / 2) + 100; 
            range = [middleOfView - (rangeWidth/2), middleOfView + (rangeWidth / 2)];
        }else{
            return {"range":[], "start": start, "end": end};
        }

        return {"range": range, "start": start, "end": end};
    }



    
}