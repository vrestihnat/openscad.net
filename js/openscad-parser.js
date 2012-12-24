define(["openscad-parser-ext"], function(ext){

    var factory = new OpenjscadSolidFactory();
    var currmodule = new Module("root");
    var module_stack = [];
    var context_stack = [];
    var includes_stack = [];
    var DEFAULT_RESOLUTION = 16;
    var DEFAULT_2D_RESOLUTION = 16;
    var FN_DEFAULT = 0;
    var FS_DEFAULT = 2.0;
    var FA_DEFAULT = 12.0;

    var logMessage;

    function Expression(value) {
        this.children = [];
        this.const_value = value;
        this.var_name;
        this.call_funcname;
        this.call_argnames = [];
        this.type = "C";
    };

    Expression.prototype.evaluate = function(context) {
            
        switch (this.type){

            case "!":
                return ! this.children[0].evaluate(context);
                break;
            case "&&":
                return this.children[0].evaluate(context) && this.children[1].evaluate(context);
                break;
            case "||":
                return this.children[0].evaluate(context) || this.children[1].evaluate(context);
                break;
            case "*":
                return this.children[0].evaluate(context) * this.children[1].evaluate(context);
                break;
            case "/":
                return this.children[0].evaluate(context) / this.children[1].evaluate(context);
                break;
            case "%":
                return this.children[0].evaluate(context) % this.children[1].evaluate(context);
                break;
            case "+":
                return this.children[0].evaluate(context) + this.children[1].evaluate(context);
                break;
            case "-":
                return this.children[0].evaluate(context) - this.children[1].evaluate(context);
                break;
            case "<":
                return this.children[0].evaluate(context) < this.children[1].evaluate(context);
                break;
            case "<=":
                return this.children[0].evaluate(context) <= this.children[1].evaluate(context);
                break;
            case "==":
                return this.children[0].evaluate(context) == this.children[1].evaluate(context);
                break;
            case "!=":
                return this.children[0].evaluate(context) != this.children[1].evaluate(context);
                break;
            case ">=":
                return this.children[0].evaluate(context) >= this.children[1].evaluate(context);
                break;
            case ">":
                return this.children[0].evaluate(context) > this.children[1].evaluate(context);
                break;
            case "?:":
                var v = this.children[0].evaluate(context);
                return this.children[v ? 1 : 2].evaluate(context);
                break;
            case "I":
                return -this.children[0].evaluate(context);
                break;
            case "C":
                return this.const_value;
                break;
            case "R":
                var v1 = this.children[0].evaluate(context);
                var v2 = this.children[1].evaluate(context);
                var v3 = this.children[2].evaluate(context);
                if (_.isNumber(v1) && _.isNumber(v2) && _.isNumber(v3)) {
                    return new Range(v1, v2, v3);
                }
                return undefined;
                break;
            case "V":
                var vec = [];
                for (var i = 0; i < this.children.length; i++) {
                    vec.push(this.children[i].evaluate(context));
                };
                return vec;
                break;
            case "L":
                return context.lookupVariable(this.var_name);
                break;
            case "[]":
                return this.children[0].evaluate(context)[this.children[1].evaluate(context)];
                break;
            case "F":
                var argvalues =[];
                for (var i = 0; i < this.children.length; i++){
                      argvalues.push(this.children[i].evaluate(context));
                }
                  
                return context.evaluateFunction(this.call_funcname, this.call_argnames, argvalues);
                break;
            default: 
                console.log("todo - evaluate expression", this);
        }    
    };

    function Range(begin,step,end) {
        this.begin = begin;
        this.step = step;
        this.end = end;
    };

    function ArgContainer() {
        this.argname;
        this.argexpr;
    };

    function ArgsContainer() {
        this.argnames = [];
        this.argexpr = [];
    };

    function Module(name) {
        this.name = name;
        this.children = [];
        this.assignments_var = {};
        this.functions = {};
        this.modules = [];
        this.argnames = [];
        this.argexpr = [];
    };

    Module.prototype.evaluate = function(parentContext, inst) {
        var lines = [];

        var context = new Context(parentContext);

        if (parentContext === undefined){
            context.setVariable("$fn", DEFAULT_RESOLUTION);
            context.setVariable("$fs", 2.0);
            context.setVariable("$fa", 12.0);
        }

        if (inst !== undefined) {
            context.args(this.argnames, this.argexpr, inst.argnames, inst.argvalues);
            context.setVariable("$children", inst.children.length);
        }

        context.inst_p = inst;
        context.functions_p = this.functions;
        context.modules_p = this.modules;

        _.each(this.assignments_var, function(value, key, list) {
            context.setVariable(key, value.evaluate(context));
        });

        var controlChildren = _.filter(this.children, function(child){ 
            return child && child.name == "echo"; 
        });

        _.each(controlChildren, function(child, index, list) {
            child.evaluate(context);
        });

        var nonControlChildren = _.reject(this.children, function(child){ 
            return !child || child.name == "echo"; 
        });

        var evaluatedLines = [];
        _.each(nonControlChildren, function(child, index, list) {

            var evaluatedChild = child.evaluate(context)
            if (evaluatedChild == undefined || (_.isArray(evaluatedChild) && _.isEmpty(evaluatedChild))){
                // ignore
            } else {
                evaluatedLines.push(evaluatedChild);
            }
        });

        var cleanedLines = _.compact(evaluatedLines);
        if (cleanedLines.length == 1){
            lines.push(cleanedLines[0]);
        } else if (cleanedLines.length > 1){
            lines.push(_.first(cleanedLines)+".union([" +_.rest(cleanedLines)+"])");
        }
        
        return lines;
    };

    function ModuleInstantiation() {
        this.name;
        this.argnames = [];
        this.argvalues = [];
        this.argexpr = [];
        this.children = [];
        this.isSubmodule = false;
        this.context;
    };

    ModuleInstantiation.prototype.evaluate = function(context) {

        var evaluatedModule;

        // NOTE: not sure how we should handle this in javascript ... is it necessary?
        //if (this.context === null) {
        //    console.log("WARNING: Ignoring recursive module instantiation of ", this.name);
        //} else {
            var that = this;

            this.argvalues = [];

            _.each(this.argexpr, function(expr,index,list) {
                that.argvalues.push(expr.evaluate(context));
            });

            that.context = context;

            evaluatedModule = context.evaluateModule(that);

            that.context = null;
            that.argvalues = [];

        //}
        return evaluatedModule;
    };

    ModuleInstantiation.prototype.evaluateChildren = function(context) {

        var childModules = []

        for (var i = 0; i < this.children.length; i++) {
            var childInst = this.children[i];
            
            var evaluatedChild = childInst.evaluate(context);
            if (evaluatedChild !== undefined){
                childModules.push(evaluatedChild);
            }
        };
        
        return childModules;
    };

    function IfElseModuleInstantiation() {
        ModuleInstantiation.call(this);
        this.name = "if";
        this.else_children = [];
    };

    IfElseModuleInstantiation.prototype = new ModuleInstantiation();

    IfElseModuleInstantiation.prototype.constructor = IfElseModuleInstantiation;

    function Context(parentContext) {
        this.vars = {};
        this.parentContext = parentContext;
        this.inst_p;
        this.functions_p = {};
        this.modules_p = {};
        context_stack.push(this);
    };

    Context.prototype.setVariable = function(name, value) {
        if (value !== undefined){
            this.vars[name] = value;
        }
    };

    Context.prototype.args = function(argnames, argexpr, call_argnames, call_argvalues) {

        for (var i = 0; i < argnames.length; i++) {
            if (i < argexpr.length && argexpr[i] !== undefined){
                this.setVariable(argnames[i], argexpr[i].evaluate(this.parentContext));
            } else {
                this.setVariable(argnames[i], undefined);
            }
        };
        var posarg = 0;  
        for (var i = 0; i < call_argnames.length; i++) {
            if (call_argnames[i] === undefined) {
                if (posarg < argnames.length){
                    this.setVariable(argnames[posarg++], call_argvalues[i]);
                }
            } else {
                this.setVariable(call_argnames[i], call_argvalues[i]);
            }
        }
    };

    Context.prototype.lookupVariable = function(name) {

        if (_.has(this.vars, name)){
            return this.vars[name];
        }

        if (this.parentContext !== undefined){
            return this.parentContext.lookupVariable(name);
        }
        
        //console.log("WARNING: Ignoring unknown variable '"+name+"'.");    
        return undefined;
    };

    Context.prototype.evaluateFunction = function(name, argnames, argvalues) {

        if (_.has(this.functions_p, name)){
            return this.functions_p[name].evaluate(this, argnames, argvalues);
        }

        if (_.has(functionNameLookup, name)){
            return functionNameLookup[name].apply(this, argvalues);
        }

        if (this.parentContext !== undefined){
            return this.parentContext.evaluateFunction(name, argnames, argvalues);
        }
            
        console.log("WARNING: Ignoring unknown function '"+name+"'.");
        return undefined;
    };

    Context.prototype.evaluateModule = function(inst) {

        var that = this;
    // this appears to double the argvalues when calling a submodule...
    //    _.each(inst.argexpr, function(expr,index,list) {
    //        inst.argvalues.push(expr.evaluate(that));
    //    });

        var customModule = _.find(this.modules_p, function(x) { return x.name == inst.name; });
        if (customModule !== undefined) {
            return customModule.evaluate(this, inst);
        }

        if (inst.isSubmodule === undefined || !inst.isSubmodule){
            var adaptor = factory.getAdaptor(inst);
            if (adaptor !== undefined){
                return adaptor.evaluate(this, inst);
            }
        }

        if (this.parentContext) {
            return this.parentContext.evaluateModule(inst);
        }

        console.log("WARNING: Ignoring unknown module: " + inst.name);
        return undefined;
    };

    function FunctionDef() {
        this.argnames = [];
        this.argexpr = [];
        this.expr;
    };

    FunctionDef.prototype.evaluate = function(parentContext, call_argnames, call_argvalues) {

        var context = new Context(parentContext);
        context.args(this.argnames, this.argexpr, call_argnames, call_argvalues);

        if (this.expr !== undefined)
            return this.expr.evaluate(context);

        return undefined;
    };


    function CoreModule(){};

    function newContext (parentContext, argnames, argexpr, inst) {
        var context = new Context(parentContext);
        context.args(argnames, argexpr, inst.argnames, inst.argvalues);
        return context;
    };


    CoreModule.prototype.evaluate = function(parentContext, inst) {
        throw Error("Should be overridden");
    };

    function PrimitiveModule(a){
      CoreModule.call(this, a);
    };

    function ControlModule(a){
      CoreModule.call(this, a);  
    };

    function OpenjscadSolidFactory(){};

    OpenjscadSolidFactory.prototype.getAdaptor = function(args) {
        switch(args.name){
            case "cube": 
                return new Cube();
            case "sphere":
                return new Sphere();
            case "cylinder":
                return new Cylinder();
            case "polyhedron":
                return new Polyhedron();
            case "circle":
                return new Circle();
            case "square":
                return new Square();
            case "polygon":
                return new Polygon();
            case "union":
                return new CSGModule("union");
            case "difference":
                return new CSGModule("subtract");
            case "intersect":
            case "intersection":
                return new CSGModule("intersect");
            case "translate":
                return new TranslateTransform();
            case "scale":
                return new ScaleTransform();
            case "rotate":
                return new RotateTransform();
            case "mirror":
                return new MirrorTransform();
            case "linear_extrude":
                return new ExtrudeTransform();
            case "color":
                return new ColorTransform();
            case "echo":
                return new Echo();
            case "multmatrix":
                return new MultimatrixTransform();
            case "for":
                return new ForLoopStatement({csgOp:"union"});
            case "intersection_for":
                return new ForLoopStatement({csgOp:"intersect"});
            case "if":
                return new IfStatement();
            case "child":
                return new Child();
            case "render":
            case "assign": // Note: assign does the same as render in this case - re-evaluate the arguments and process the children.
                return new RenderModule();
            default:
                if (args instanceof ModuleInstantiation){
                    return new ModuleAdaptor()
                }
                return undefined;
        }
    };


    function ModuleAdaptor(a){
        CoreModule.call(this, a);
    };

    ModuleAdaptor.prototype.evaluate = function(parentContext, inst){
        inst.isSubmodule = true;
        return parentContext.evaluateModule(inst);
    };

    function RenderModule(a){
        TransformModule.call(this, a);
    };

    RenderModule.prototype.evaluate = function(parentContext, inst){

        inst.argvalues = [];

        _.each(inst.argexpr, function(expr,index,list) {
            inst.argvalues.push(expr.evaluate(parentContext));
        });

        var context = newContext(parentContext, [], [], inst);


        var childIndex = 0;
        if (inst.argvalues[0] !== undefined){
            childIndex = inst.argvalues[0];
        }

        return this.transformChildren(inst.children, context, function(){
            return "";
        });
    };


    function printContext(c){
        console.log(c.vars);
        if (c.parentContext){
            printContext(c.parentContext);
        }
    }

    function Child(a){
        CoreModule.call(this, a);
    };

    Child.prototype.evaluate = function(parentContext, inst){
        
        inst.argvalues = [];
        _.each(inst.argexpr, function(expr,index,list) {
            inst.argvalues.push(expr.evaluate(parentContext));
        });

        var context = newContext(parentContext, [], [], inst);

        var childIndex = 0;
        if (inst.argvalues[0] !== undefined){
            childIndex = inst.argvalues[0];
        }

        var evaluatedChildren = [];

        for (var i = context_stack.length - 1; i >= 0; i--) {
            var ctx = context_stack[i];

            if (ctx.inst_p !== undefined){
                if (childIndex < ctx.inst_p.children.length) {

                    var childInst = ctx.inst_p.children[childIndex];

                    _.each(childInst.argexpr, function(expr,index,list) {
                        childInst.argvalues.push(expr.evaluate(ctx.inst_p.ctx));
                    });

                    var childAdaptor = factory.getAdaptor(childInst);
                    evaluatedChildren.push(childAdaptor.evaluate(ctx.inst_p.ctx, childInst));

                }
                return evaluatedChildren;
            }
            ctx = ctx.parentContext;
        };
        
        return undefined;
    };


    function ExtrudeTransform(a){
        TransformModule.call(this, a);
    };

    ExtrudeTransform.prototype.evaluate = function(parentContext, inst){
        inst.argvalues = [];

        _.each(inst.argexpr, function(expr,index,list) {
            inst.argvalues.push(expr.evaluate(parentContext));
        });


        var context = newContext(parentContext, ["file", "layer", "height", "origin", "scale", "center", "twist", "slices", "$fn", "$fs", "$fa"], [], inst);

        var height = contextVariableLookup(context, "height", 100);
        var center = contextVariableLookup(context, "center", false);
        var twist = Number(contextVariableLookup(context, "twist", 0))/-1; // note inverse for openjscad
        var slices = contextVariableLookup(context, "slices", undefined);
        var fn = contextVariableLookup(context, "$fn", FN_DEFAULT);
        var fs = contextVariableLookup(context, "$fs", FS_DEFAULT);
        var fa = contextVariableLookup(context, "$fa", FA_DEFAULT);

        if (slices === undefined){
            slices = parseInt(Math.max(2, Math.abs(get_fragments_from_r(height, context) * twist / 360)));
        }

        return this.transformChildren(inst.children, context, function(){
            var template = _.template(".extrude({offset: [0, 0, <%=height%>], twistangle: <%=twist%>,twiststeps: <%=slices%>})", {height:height, twist:twist, slices:slices});
            if (center){
                var offset = -height/2;
                template += _.template(".translate([0,0,<%=offset%>])", {offset:offset});
            }
            return template;
        });
    };

    function IfStatement(a){
        ControlModule.call(this, a);
    };

    IfStatement.prototype.evaluate = function(parentContext, inst){
        inst.argvalues = [];

        _.each(inst.argexpr, function(expr,index,list) {
            inst.argvalues.push(expr.evaluate(parentContext));
        });

        var context = newContext(parentContext, [], [], inst);

        var childrenToEvaluate = (inst.argvalues.length > 0 && inst.argvalues[0])? inst.children : inst.else_children;

        var childModules = [];

        for (var i = 0; i < childrenToEvaluate.length; i++) {

            var childInst = childrenToEvaluate[i];

            childInst.argvalues = [];

            _.each(childInst.argexpr, function(expr,index,list) {
                childInst.argvalues.push(expr.evaluate(context));
            });

            var childAdaptor = factory.getAdaptor(childInst);

            childModules.push(childAdaptor.evaluate(context, childInst));
        };
        if (_.isEmpty(childModules)){
            return undefined;
        } else {
            return childModules;
        }
    };

    function ForLoopStatement(a){
        ControlModule.call(this, a);
        this.csgOp = a.csgOp;

        this.forEval = function(parentEvaluatedChildren, inst, recurs_length, call_argnames, call_argvalues, arg_context)
        {
            evaluatedChildren = parentEvaluatedChildren;

            if (call_argnames.length > recurs_length) {
                var it_name = call_argnames[recurs_length];
                var it_values = call_argvalues[recurs_length];
                var context = new Context(arg_context);
            
                if (it_values instanceof Range) {
                    var range = it_values;
                    if (range.end < range.begin) {
                        var t = range.begin;
                        range.begin = range.end;
                        range.end = t;
                    }
                    if (range.step > 0 && (range.begin-range.end)/range.step < 10000) {
                        for (var i = range.begin; i <= range.end; i += range.step) {
                            context.setVariable(it_name, i);
                            this.forEval(evaluatedChildren, inst, recurs_length+1, call_argnames, call_argvalues, context);
                        }
                    }
                }
                else if (_.isArray(it_values)) {
                    for (var i = 0; i < it_values.length; i++) {
                        context.setVariable(it_name, it_values[i]);
                        this.forEval(evaluatedChildren, inst, recurs_length+1, call_argnames, call_argvalues, context);
                    }
                }
            } else if (recurs_length > 0) {
                evaluatedChildren = _.union(evaluatedChildren, inst.evaluateChildren(arg_context));
            }

            // Note: we union here so subsequent actions (e.g. translate) can be performed on the entire result of the for loop.
            if (_.isArray(evaluatedChildren) && evaluatedChildren.length > 1){
                var unionedEvaluatedChildren = _.first(evaluatedChildren)+"."+this.csgOp+"([" + _.rest(evaluatedChildren) + "])";
                evaluatedChildren = unionedEvaluatedChildren;
            }
            return evaluatedChildren;
        };
    };

    ForLoopStatement.prototype.evaluate = function(context, inst) {

        if (inst.context === undefined){
            inst.context = context;
        }

        return this.forEval([], inst, 0, inst.argnames, inst.argvalues, inst.context);
    };

    function MultimatrixTransform(a){
        TransformModule.call(this, a);

        this.transposeMatrix = function(m) {
            var t = []
            var ti = 0;

            for (var j in _.range(4)){
                for (var i in _.range(4)){
                    t[ti++] = m[i][j];
                }
            }
            return t;
        };
    };

    MultimatrixTransform.prototype.evaluate = function(parentContext, inst){

        inst.argvalues = [];

        _.each(inst.argexpr, function(expr,index,list) {
            inst.argvalues.push(expr.evaluate(parentContext));
        });

        var context = newContext(parentContext, ["m"], [], inst);

        var m = contextVariableLookup(context, "m", undefined);

        var matrix;
        if (m !== undefined){
            matrix = this.transposeMatrix(m);
        }

        return this.transformChildren(inst.children, context, function(){
            return _.template('.transform(new CSG.Matrix4x4( [<%= matrix %>] ))', {matrix:matrix});
        });
    };


    function Echo(a){
        ControlModule.call(this, a);
    };

    Echo.prototype.evaluate = function(parentContext, inst){
        var context = new Context(parentContext);
        var argvalues = [];
        
        _.each(inst.argexpr, function(expr,index,list) {
            argvalues.push(convertForStrFunction(expr.evaluate(context)));
        });

        logMessage(_.template("ECHO: <%=argvalues%>", {argvalues:argvalues}));

        return undefined;
    };


    function TransformModule(a){
      CoreModule.call(this, a);

      this.transformChildren = function (children, context, cb) {
          var childModules = []

            for (var i = 0; i < children.length; i++) {

                var childInst = children[i];

                childInst.argvalues = [];  // NOTE: not sure if this is the right solution!

                _.each(childInst.argexpr, function(expr,index,list) {
                    childInst.argvalues.push(expr.evaluate(context));
                });
                var childAdaptor = factory.getAdaptor(childInst);
                var transformedChild = childAdaptor.evaluate(context, childInst);
                transformedChild += cb();
                
                childModules.push(transformedChild);
            };

            if (childModules.length == 1){
                return childModules[0];
            } else {
                return _.first(childModules)+".union([" + _.rest(childModules) + "])";
            }
            
      }

    };


    function ColorTransform(a){
      TransformModule.call(this, a);
    };

    ColorTransform.prototype.evaluate = function(parentContext, inst){

        inst.argvalues = [];

        _.each(inst.argexpr, function(expr,index,list) {
            inst.argvalues.push(expr.evaluate(parentContext));
        });

        var context = newContext(parentContext, ["c", "alpha"], [], inst);

        var c = contextVariableLookup(context, "c", undefined);
        var color = "white";
        if (c !== undefined){
            color = _.isString(c)? colorNameLookup[stripString(c.toLowerCase())] : c;
        }

        var alpha = contextVariableLookup(context, "alpha", undefined);
        if (alpha !== undefined){
            color[3] = alpha;
        }

        return this.transformChildren(inst.children, context, function(){
            return _.template('.setColor(<%=color%>)', {color:color});
        });
    };



    function MirrorTransform(a){
        TransformModule.call(this, a);
    };

    MirrorTransform.prototype.evaluate = function(parentContext, inst){

        inst.argvalues = [];

        _.each(inst.argexpr, function(expr,index,list) {
            inst.argvalues.push(expr.evaluate(parentContext));
        });

        var context = newContext(parentContext, ["v"], [], inst);
        
        var v = contextVariableLookup(context, "v", [0,0,0]);
        
        if (!(v instanceof Array)){
            var val = v;
            v = [val,val,val];
        }

        return this.transformChildren(inst.children, context, function(){
            return _.template('.mirrored(CSG.Plane.fromNormalAndPoint([<%=v%>], [0,0,0]))', {v:v});
        });
    };


    function RotateTransform(a){
        TransformModule.call(this, a);
    };

    RotateTransform.prototype.evaluate = function(parentContext, inst){
        
        inst.argvalues = [];

        _.each(inst.argexpr, function(expr,index,list) {
            inst.argvalues.push(expr.evaluate(parentContext));
        });

        var context = newContext(parentContext, ["a","v"], [], inst);

        var a = contextVariableLookup(context, "a", undefined);

        if (_.isArray(a)){
            return this.transformChildren(inst.children, context, function(){
                return _.template('.rotateX(<%=degreeX%>).rotateY(<%=degreeY%>).rotateZ(<%=degreeZ%>)', {degreeX:a[0],degreeY:a[1],degreeZ:a[2]});
            });
        } else {
            var v = contextVariableLookup(context, "v", undefined);
            return this.transformChildren(inst.children, context, function(){
                if (v.toString() =="0,0,0"){
                    v = [0,0,1];
                }
                return _.template('.transform(CSG.Matrix4x4.rotation([0,0,0], [<%=vector%>], <%=degree%>))', {degree:a, vector:v});
            });
        }
    };


    function ScaleTransform(a){
        TransformModule.call(this, a);
    };

    ScaleTransform.prototype.evaluate = function(parentContext, inst){
        
        inst.argvalues = [];

        _.each(inst.argexpr, function(expr,index,list) {
            inst.argvalues.push(expr.evaluate(parentContext));
        });

        var context = newContext(parentContext, ["v"], [], inst);

        var v = contextVariableLookup(context, "v", [0,0,0]);

        return this.transformChildren(inst.children, context, function(){
            return _.template('.scale([<%=v%>])', {v:v});
        });
    };


    function TranslateTransform(a){
        TransformModule.call(this, a);
    };

    TranslateTransform.prototype.evaluate = function(parentContext, inst){

        inst.argvalues = [];

        _.each(inst.argexpr, function(expr,index,list) {
            inst.argvalues.push(expr.evaluate(parentContext));
        });

        var context = newContext(parentContext, ["v"], [], inst);

        var v = contextVariableLookup(context, "v", [0,0,0]);

        return this.transformChildren(inst.children, context, function(){
            return _.template('.translate([<%=v%>])', {v:v});
        });

    };

    function CSGModule(csgOperation){
        this.csgOperation = csgOperation;
    };

    CSGModule.prototype.evaluate = function(parentContext, inst){
        var context = new Context(parentContext);

        var childModules = []

        for (var i = 0; i < inst.children.length; i++) {

            var childInst = inst.children[i];
            childInst.argvalues = [];
            _.each(childInst.argexpr, function(expr,index,list) {
                childInst.argvalues.push(expr.evaluate(context));
            });
            
            var childAdaptor = factory.getAdaptor(childInst);

            var evaluatedChild = childAdaptor.evaluate(parentContext, childInst);
            if (evaluatedChild !== undefined){
                childModules.push(evaluatedChild);
            }
        };
        if (childModules.length <= 1){
            return childModules[0];
        } else {
            return childModules[0] + "."+this.csgOperation+"([" + childModules.slice(1).join(',\n') + "])";
        }
    };

    function Sphere(a){
      PrimitiveModule.call(this, a);
    };

    Sphere.prototype.evaluate = function(parentContext, inst){
        var context = new Context(parentContext);

        var argnames = ["r", "$fn"];
        var argexpr = [];

        context.args(argnames, argexpr, inst.argnames, inst.argvalues);
        
        var r = contextVariableLookup(context, "r", 1);
        var resolution = get_fragments_from_r(r, context);

        var openjscadParameters = {center:[0,0,0], resolution:resolution, radius:r};
                   
        return _.template('CSG.sphere({center: [<%=String(center)%>], radius: <%= radius %>, resolution: <%= resolution%>})', openjscadParameters);
    }

    function Cylinder(a){
      PrimitiveModule.call(this, a);
    };

    Cylinder.prototype.evaluate = function(parentContext, inst) {

        var context = new Context(parentContext);

        var argnames = ["h", "r1", "r2", "center", "$fn", "$fa", "$fs"];
        var argexpr = [];

        context.args(argnames, argexpr, inst.argnames, inst.argvalues);

        var openjscadArgs = {start: [0,0,0], end: [0,0,1], radiusStart: 1, radiusEnd: 1, resolution: DEFAULT_RESOLUTION};
        var isCentered = contextVariableLookup(context, "center", false);
        var h = contextVariableLookup(context, "h", 1);
        var r = contextVariableLookup(context, "r", 1);
        var r1 = contextVariableLookup(context, "r1", undefined);
        var r2 = contextVariableLookup(context, "r2", undefined);
                    
        var startZ = isCentered? -(h/2) : 0;
        var endZ = isCentered? h/2 : h;

        openjscadArgs.start = [0, 0, startZ];
        openjscadArgs.end = [0, 0, endZ];

        /* we have to check the context vars directly here in case a parent module in the context stack has the same parameters, e.g. r1 which would be used as default.
           Example testcad case:
                module ring(r1, r2, h) {
                    cylinder(r = 3, h = h);
                }
                ring(8, 6, 10);
        */
        if (_.has(context.vars, 'r')) {
            openjscadArgs.radiusStart = r;
            openjscadArgs.radiusEnd = r;
        }
        if (_.has(context.vars, 'r1')) {
            openjscadArgs.radiusStart = r1;
        }
        if (_.has(context.vars, 'r2')) {
            openjscadArgs.radiusEnd = r2;
        }
        openjscadArgs.resolution = get_fragments_from_r(Math.max(openjscadArgs.radiusStart, openjscadArgs.radiusEnd), context);
        
        return _.template('CSG.cylinder({start: [<%=start%>], end: [<%=end%>],radiusStart: <%=radiusStart%>, radiusEnd: <%=radiusEnd%>, resolution: <%=resolution%>})', openjscadArgs);    
    };


    function Cube(a){
      PrimitiveModule.call(this, a);
    };

    Cube.prototype.evaluate = function(parentContext, inst) {
        var context = new Context(parentContext);

        var argnames = ["size", "center"];
        var argexpr = [];

        context.args(argnames, argexpr, inst.argnames, inst.argvalues);

        var openjscadArgs = {resolution:DEFAULT_RESOLUTION};
        var isCentered = contextVariableLookup(context, "center", false);
        var size = contextVariableLookup(context, "size", 1);
        
        if (size instanceof Array){
            openjscadArgs.radius = [size[0]/2, size[1]/2, size[2]/2];
        } else {
            openjscadArgs.radius = [size/2,size/2,size/2];
        }

        if (isCentered){
            openjscadArgs.centerVector = [0,0,0];
        } else {
            openjscadArgs.centerVector = [openjscadArgs.radius[0],openjscadArgs.radius[1],openjscadArgs.radius[2]];
        }

        return _.template('CSG.cube({center: [<%=String(centerVector)%>],radius: [<%= radius %>], resolution: <%= resolution%>})', openjscadArgs);
    };

    function Polyhedron(a){
        TransformModule.call(this, a);
    };

    Polyhedron.prototype.evaluate = function(parentContext, inst){
        var context = newContext(parentContext, ["points", "triangles", "convexity"], [], inst);

        var points = contextVariableLookup(context, "points", []);
        var triangles = contextVariableLookup(context, "triangles", []);
        
        var polygons=[];

        _.each(triangles, function(triangle) {
            polygons.push(
                _.template("new CSG.Polygon([new CSG.Vertex(new CSG.Vector3D([<%=vec1%>])),new CSG.Vertex(new CSG.Vector3D([<%=vec2%>])),new CSG.Vertex(new CSG.Vector3D([<%=vec3%>]))])", 
                    {vec1:points[triangle[2]],
                    vec2:points[triangle[1]],
                    vec3:points[triangle[0]]}));
        });

        return _.template("CSG.fromPolygons([<%=polygons%>])", {polygons:polygons});   
    };


    function Circle(a){
        PrimitiveModule.call(this, a);
    };

    Circle.prototype.evaluate = function(parentContext, inst){
        var context = newContext(parentContext, ["r", "$fn"], [], inst);

        var r = contextVariableLookup(context, "r", 1);
        var resolution = get_fragments_from_r(r, context);
        
        return _.template('CAG.circle({center: [0,0], radius: <%=r%>, resolution: <%=resolution%>})', {r:r,resolution:resolution});
        
    };


    function Square(a){
        PrimitiveModule.call(this, a);
    };

    Square.prototype.evaluate = function(parentContext, inst){
        var context = newContext(parentContext, ["size", "center"], [], inst);

        var size = contextVariableLookup(context, "size", [0.5,0.5]);
        var center = contextVariableLookup(context, "center", false);
        var radius = _.isArray(size)? radius = [size[0]/2,size[1]/2] : [size/2,size/2];
        var centerPoint = [0,0];
        if (!center){
            centerPoint = [size[0]/2, size[1]/2]
        }

        return _.template('CAG.rectangle({center: [<%=centerPoint%>], radius: [<%=radius%>]})', {centerPoint:centerPoint, radius:radius});
    };

    function Polygon(a){
        PrimitiveModule.call(this, a);
    };

    Polygon.prototype.evaluate = function(parentContext, inst){
        var context = newContext(parentContext, ["points", "paths", "convexity"], [], inst);

        var points = contextVariableLookup(context, "points", []);
        var paths = contextVariableLookup(context, "paths", []);
        var pointsMap = [];

        function formatPoints (points){
            return _.map(points, function(x){return _.template("[<%=x%>]", {x:x})});
        }

        if (_.isEmpty(paths)){
            return _.template('CAG.fromPoints([<%=points%>])', {points:formatPoints(points)});
        }

        if (paths.length > 1){
            var lines = "";

            _.each(_.first(paths), function(x) {
                pointsMap.push(points[x]);
            });
            lines += _.template('(new CSG.Path2D([<%=points%>],true)).innerToCAG().subtract([', {points:formatPoints(pointsMap)});
            
            var holes = [];
            
            _.each(_.rest(paths), function(shape) {
                pointsMap = [];
                _.each(shape, function(x) {
                    pointsMap.push(points[x]);
                });
                holes.push(_.template('(new CSG.Path2D([<%=points%>],true)).innerToCAG()', {points:formatPoints(pointsMap)}));   
            });

            lines += holes.join(',') + "])";

            return lines;

        } else {
            _.each(paths[0], function(x) {
                pointsMap.push(points[x]);
            });
            return _.template('(new CSG.Path2D([<%=points%>],true)).innerToCAG()', {points:formatPoints(pointsMap)});
        }   
    };

    function contextVariableLookup(context, name, defaultValue){
        var val = context.lookupVariable(name);
        if (val === undefined){
            val = defaultValue;
        }
        return val;
    }

    function stripString (s) {
        if (/^\".*\"$/.test(s)){
            return s.match(/^\"(.*)\"$/)[1];
        } else {
            return s;
        }
    }

    function convertForStrFunction(val){
        if (_.isString(val)){
            return stripString(val);
        }

        if (_.isArray(val)){
            var mapped = _.map(val, function (value, key, list) {
                return convertForStrFunction(value);
            });

            return "["+mapped.join(',')+"]";
        }

        return val;
    }

    var functionNameLookup = {"cos":Math.cosdeg,"sin":Math.sindeg, "acos":Math.acosdeg,"asin":Math.asindeg,"atan":Math.atandeg,"atan2":Math.atan2deg,"tan":Math.tandeg,"max":Math.max,"min":Math.min, "ln":Math.log, 
        "len":function(val){
            var x = _.isString(val[0]) ? stripString(val[0]) : val[0];
            return x.length;
        },
        "log":function(){
            if (arguments[0].length == 2){
                return Math.log(arguments[0][1])/Math.log(arguments[0][0]);
            } else if (arguments[0].length == 1){
                return Math.log(arguments[0][0]);
            } else {
                return undefined;
            }
        },
        "str":function(){
            var vals = [];
            _.each(arguments[0], function(x){
                vals.push(convertForStrFunction(x));
            });

            return vals.join('');
        },
        "sign": function(val){
            return (val > 0)? 1.0 : ((val < 0)? -1.0 : 0);
        },
        "lookup": function(){
            var low_p, low_v, high_p, high_v;
            if (arguments.length < 2){
                logMessage("Lookup arguments are invalid. Incorrect parameter count. " +  arguments);
                return undefined;
            }

            var p = arguments[0];
            var vector = arguments[1];
            if (!_.isNumber(p)        ||      // First must be a number
                !_.isArray(vector)      ||      // Second must be a vector of vectors
                vector.length < 2       ||
                (vector.length >=2 && !_.isArray(vector[0]))
                ){
                logMessage("Lookup arguments are invalid. Incorrect parameters. " +  arguments);
                return undefined;
            }

            if (vector[0].length != 2){
                logMessage("Lookup arguments are invalid. First vector has incorrect number of values. " +  p + ",  " + vector);
                return undefined;
            }
            low_p = vector[0][0];
            low_v = vector[0][1];
            high_p = low_p;
            high_v = low_v;

            _.each(vector.slice(1), function(v){
                if (v.length == 2){
                    var this_p = v[0];
                    var this_v = v[1];

                    if (this_p <= p && (this_p > low_p || low_p > p)) {
                        low_p = this_p;
                        low_v = this_v;
                    }
                    if (this_p >= p && (this_p < high_p || high_p < p)) {
                        high_p = this_p;
                        high_v = this_v;
                    }
                }
            });

            if (p <= low_p){
                return low_v;
            }
                
            if (p >= high_p){
                return high_v;
            }

            var f = (p-low_p) / (high_p-low_p);
            return high_v * f + low_v * (1-f);
        }

    };

    var colorNameLookup = {"indianred":[0.804,0.361,0.361], "lightcoral":[0.941,0.502,0.502], "salmon":[0.980,0.502,0.447], "darksalmon":[0.914,0.588,0.478], "lightsalmon":[1,0.627,0.478], "red":[1,0,0], "crimson":[0.863,0.078,0.235], "firebrick":[0.698,0.133,0.133], "darkred":[0.545,0,0], "pink":[1,0.753,0.796], "lightpink":[1,0.714,0.757], "hotpink":[1,0.412,0.706], "deeppink":[1,0.078,0.576], "mediumvioletred":[0.780,0.082,0.522], "palevioletred":[0.859,0.439,0.576], "lightsalmon":[1,0.627,0.478], "coral":[1,0.498,0.314], "tomato":[1,0.388,0.278], "orangered":[1,0.271,0], "darkorange":[1,0.549,0], "orange":[1,0.647,0], "gold":[1,0.843,0], "yellow":[1,1,0], "lightyellow":[1,1,0.878], "lemonchiffon":[1,0.980,0.804], "lightgoldenrodyellow":[0.980,0.980,0.824], "papayawhip":[1,0.937,0.835], "moccasin":[1,0.894,0.710], "peachpuff":[1,0.855,0.725], "palegoldenrod":[0.933,0.910,0.667], "khaki":[0.941,0.902,0.549], "darkkhaki":[0.741,0.718,0.420], "lavender":[0.902,0.902,0.980], "thistle":[0.847,0.749,0.847], "plum":[0.867,0.627,0.867], "violet":[0.933,0.510,0.933], "orchid":[0.855,0.439,0.839], "fuchsia":[1,0,1], "magenta":[1,0,1], "mediumorchid":[0.729,0.333,0.827], "mediumpurple":[0.576,0.439,0.859], "blueviolet":[0.541,0.169,0.886], "darkviolet":[0.580,0,0.827], "darkorchid":[0.600,0.196,0.800], "darkmagenta":[0.545,0,0.545], "purple":[0.502,0,0.502], "indigo":[0.294,0,0.510], "darkslateblue":[0.282,0.239,0.545], "slateblue":[0.416,0.353,0.804], "mediumslateblue":[0.482,0.408,0.933], "greenyellow":[0.678,1,0.184], "chartreuse":[0.498,1,0], "lawngreen":[0.486,0.988,0], "lime":[0,1,0], "limegreen":[0.196,0.804,0.196], "palegreen":[0.596,0.984,0.596], "lightgreen":[0.565,0.933,0.565], "mediumspringgreen":[0,0.980,0.604], "springgreen":[0,1,0.498], "mediumseagreen":[0.235,0.702,0.443], "seagreen":[0.180,0.545,0.341], "forestgreen":[0.133,0.545,0.133], "green":[0,0.502,0], "darkgreen":[0,0.392,0], "yellowgreen":[0.604,0.804,0.196], "olivedrab":[0.420,0.557,0.137], "olive":[0.502,0.502,0], "darkolivegreen":[0.333,0.420,0.184], "mediumaquamarine":[0.400,0.804,0.667], "darkseagreen":[0.561,0.737,0.561], "lightseagreen":[0.125,0.698,0.667], "darkcyan":[0,0.545,0.545], "teal":[0,0.502,0.502], "aqua":[0,1,1], "cyan":[0,1,1], "lightcyan":[0.878,1,1], "paleturquoise":[0.686,0.933,0.933], "aquamarine":[0.498,1,0.831], "turquoise":[0.251,0.878,0.816], "mediumturquoise":[0.282,0.820,0.800], "darkturquoise":[0,0.808,0.820], "cadetblue":[0.373,0.620,0.627], "steelblue":[0.275,0.510,0.706], "lightsteelblue":[0.690,0.769,0.871], "powderblue":[0.690,0.878,0.902], "lightblue":[0.678,0.847,0.902], "skyblue":[0.529,0.808,0.922], "lightskyblue":[0.529,0.808,0.980], "deepskyblue":[0,0.749,1], "dodgerblue":[0.118,0.565,1], "cornflowerblue":[0.392,0.584,0.929], "royalblue":[0.255,0.412,0.882], "blue":[0,0,1], "mediumblue":[0,0,0.804], "darkblue":[0,0,0.545], "navy":[0,0,0.502], "midnightblue":[0.098,0.098,0.439], "cornsilk":[1,0.973,0.863], "blanchedalmond":[1,0.922,0.804], "bisque":[1,0.894,0.769], "navajowhite":[1,0.871,0.678], "wheat":[0.961,0.871,0.702], "burlywood":[0.871,0.722,0.529], "tan":[0.824,0.706,0.549], "rosybrown":[0.737,0.561,0.561], "sandybrown":[0.957,0.643,0.376], "goldenrod":[0.855,0.647,0.125], "darkgoldenrod":[0.722,0.525,0.043], "peru":[0.804,0.522,0.247], "chocolate":[0.824,0.412,0.118], "saddlebrown":[0.545,0.271,0.075], "sienna":[0.627,0.322,0.176], "brown":[0.647,0.165,0.165], "maroon":[0.502,0,0], "white":[1,1,1], "snow":[1,0.980,0.980], "honeydew":[0.941,1,0.941], "mintcream":[0.961,1,0.980], "azure":[0.941,1,1], "aliceblue":[0.941,0.973,1], "ghostwhite":[0.973,0.973,1], "whitesmoke":[0.961,0.961,0.961], "seashell":[1,0.961,0.933], "beige":[0.961,0.961,0.863], "oldlace":[0.992,0.961,0.902], "floralwhite":[1,0.980,0.941], "ivory":[1,1,0.941], "antiquewhite":[0.980,0.922,0.843], "linen":[0.980,0.941,0.902], "lavenderblush":[1,0.941,0.961], "mistyrose":[1,0.894,0.882], "gainsboro":[0.863,0.863,0.863], "lightgrey":[0.827,0.827,0.827], "silver":[0.753,0.753,0.753], "darkgray":[0.663,0.663,0.663], "gray":[0.502,0.502,0.502], "dimgray":[0.412,0.412,0.412], "lightslategray":[0.467,0.533,0.600], "slategray":[0.439,0.502,0.565], "darkslategray":[0.184,0.310,0.310], "black":[0,0,0]};

    function add_var(yy, id,val){

        if (yy.var_list == undefined){
            yy.var_list = {};    
        }

        yy.var_list[id] = val;
    }

    function localLog(msg){
        console.log(msg);
    }

    /*
        Returns the number of subdivision of a whole circle, given radius and
        the three special variables $fn, $fs and $fa
    */
    function get_fragments_from_r(r, context) {
        var fn = contextVariableLookup(context, "$fn", FN_DEFAULT);
        var fs = contextVariableLookup(context, "$fs", FS_DEFAULT);
        var fa = contextVariableLookup(context, "$fa", FA_DEFAULT);

        var GRID_FINE   = 0.000001;
        if (r < GRID_FINE) return 0;
        if (fn > 0.0)
            return parseInt(fn);
        return parseInt(Math.ceil(Math.max(Math.min(360.0 / fa, r*2*Math.PI / fs), 5)));
    }

    function resetModule() {
        currmodule = new Module("root");
        context_stack = [];
        includes_stack = [];
        module_stack = [];
    }

var parser = {trace: function trace() { },
yy: {},
symbols_: {"error":2,"program":3,"input":4,"statement":5,"inner_input":6,"statement_begin":7,"statement_end":8,"TOK_MODULE":9,"TOK_ID":10,"(":11,"arguments_decl":12,"optional_commas":13,")":14,";":15,"{":16,"}":17,"module_instantiation":18,"=":19,"expr":20,"TOK_FUNCTION":21,"BR":22,"children_instantiation":23,"module_instantiation_list":24,"if_statement":25,"TOK_IF":26,"ifelse_statement":27,"TOK_ELSE":28,"single_module_instantiation":29,"arguments_call":30,"!":31,"#":32,"%":33,"*":34,"TOK_TRUE":35,"TOK_FALSE":36,"TOK_UNDEF":37,".":38,"TOK_STRING":39,"TOK_NUMBER":40,"[":41,":":42,"]":43,"vector_expr":44,"/":45,"+":46,"-":47,"<":48,"LE":49,"EQ":50,"NE":51,"GE":52,">":53,"AND":54,"OR":55,"?":56,",":57,"argument_decl":58,"argument_call":59,"$accept":0,"$end":1},
terminals_: {2:"error",9:"TOK_MODULE",10:"TOK_ID",11:"(",14:")",15:";",16:"{",17:"}",19:"=",21:"TOK_FUNCTION",22:"BR",26:"TOK_IF",28:"TOK_ELSE",31:"!",32:"#",33:"%",34:"*",35:"TOK_TRUE",36:"TOK_FALSE",37:"TOK_UNDEF",38:".",39:"TOK_STRING",40:"TOK_NUMBER",41:"[",42:":",43:"]",45:"/",46:"+",47:"-",48:"<",49:"LE",50:"EQ",51:"NE",52:"GE",53:">",54:"AND",55:"OR",56:"?",57:","},
productions_: [0,[3,1],[4,0],[4,2],[6,0],[6,2],[5,2],[7,0],[7,6],[8,1],[8,3],[8,1],[8,4],[8,9],[8,1],[23,1],[23,3],[25,5],[27,1],[27,3],[18,2],[18,2],[18,1],[24,0],[24,2],[29,4],[29,2],[29,2],[29,2],[29,2],[20,1],[20,1],[20,1],[20,1],[20,3],[20,1],[20,1],[20,5],[20,7],[20,3],[20,4],[20,3],[20,3],[20,3],[20,3],[20,3],[20,3],[20,3],[20,3],[20,3],[20,3],[20,3],[20,3],[20,3],[20,2],[20,2],[20,2],[20,3],[20,5],[20,4],[20,4],[13,2],[13,0],[44,1],[44,4],[12,0],[12,1],[12,4],[58,1],[58,3],[30,0],[30,1],[30,4],[59,1],[59,3]],
performAction: function anonymous(yytext,yyleng,yylineno,yy,yystate,$$,_$) {

var $0 = $$.length - 1;
switch (yystate) {
case 1: 

            var lines = [];
            lines.push("function main(){");
            lines.push("\n");

            var context = undefined;
            if (yy.context !== undefined){
                context = yy.context;
            }

            if (yy.logMessage !== undefined){
                logMessage = yy.logMessage;
            } else {
                logMessage = localLog;
            }

            var res = ext.currmodule.evaluate(context);

            var evaluatedLines = _.flatten(res);
            if (evaluatedLines.length == 1){
                lines.push("return "+evaluatedLines[0] + ';');
            } else if (evaluatedLines.length > 1){
                lines.push("return "+_.first(evaluatedLines)+".union([");
                lines.push(_.rest(evaluatedLines));
                lines.push("]);");
            }
            lines.push("};");

            var x = {lines:lines, context:context_stack[context_stack.length-1]};
            resetModule();

            return x;
        
break;
case 8:

            var p_currmodule = ext.currmodule;
            ext.module_stack.push(ext.currmodule);
            
            ext.currmodule = new Module($$[$0-4]);

            p_currmodule.modules.push(ext.currmodule);

            ext.currmodule.argnames = $$[$0-2].argnames;
            ext.currmodule.argexpr = $$[$0-2].argexpr;
            
            delete $$[$0-2];           
        
break;
case 9:           
        
break;
case 10:
            if (ext.module_stack.length > 0){
                ext.currmodule = ext.module_stack.pop();
            }
        
break;
case 11:
            ext.currmodule.children.push($$[$0]);
        
break;
case 12:  
            ext.currmodule.assignments_var[$$[$0-3]] = $$[$0-1]; 
        
break;
case 13:
            var func = new FunctionDef();
            func.argnames = $$[$0-5].argnames;
            func.argexpr = $$[$0-5].argexpr;
            func.expr = $$[$0-1];
            ext.currmodule.functions[$$[$0-7]] = func;
            delete $$[$0-5];
        
break;
case 15:   
            this.$ = new ModuleInstantiation();
            if ($$[$0]) { 
                this.$.children.push($$[$0]);
            }
        
break;
case 16:
            this.$ = $$[$0-1]; 
        
break;
case 17:
            this.$ = new IfElseModuleInstantiation();
            this.$.argnames.push("");
            this.$.argexpr.push($$[$0-2]);

            if (this.$) {
                this.$.children = $$[$0].children;
            } else {
                for (var i = 0; i < $$[$0].children.size(); i++)
                    delete $$[$0].children[i];
            }
            delete $$[$0];
        
break;
case 18:
            this.$ = $$[$0];
        
break;
case 19:
            this.$ = $$[$0-2];
            if (this.$) {
                this.$.else_children = $$[$0].children;
            } else {
                for (var i = 0; i < $$[$0].children.size(); i++)
                    delete $$[$0].children[i];
            }
            delete $$[$0];
        
break;
case 20: 
            this.$ = $$[$0-1]; 
        
break;
case 21:   
            this.$ = $$[$0-1];
            if (this.$) {
                this.$.children = $$[$0].children;
            } else {
                for (var i = 0; i < $$[$0].children.length; i++)
                delete $$[$0].children[i];
            }   
            delete $$[$0];
        
break;
case 22:
            this.$ = $$[$0];
        
break;
case 23: 
            this.$ = new ModuleInstantiation(); 
        
break;
case 24:
            this.$ = $$[$0-1];
            if (this.$) {
                if ($$[$0]) {
                    this.$.children.push($$[$0]);
                }
            } else {
                delete $$[$0];
            }
        
break;
case 25:   
            this.$ = new ModuleInstantiation();
            this.$.name = $$[$0-3];
            this.$.argnames = $$[$0-1].argnames;
            this.$.argexpr = $$[$0-1].argexpr;
            delete $$[$0-1];
        
break;
case 26:
            this.$ = $$[$0];
            if (this.$) {
                this.$.tag_root = true;
            }                
        
break;
case 27:
            this.$ = $$[$0];
            if (this.$) {
                this.$.tag_highlight = true;
            }
        
break;
case 28:
            /* - NOTE: Currently unimplemented, therefore not displaying parts marked with %
                this.$ = $$[$0];
                if (this.$) {
                    this.$.tag_background = true;
                }
            */
            delete $$[$0];
            this.$ = undefined;
        
break;
case 29:
            delete $$[$0];
            this.$ = undefined;
        
break;
case 30:   
            this.$ = new Expression(true); 
        
break;
case 31: 
            this.$ = new Expression(false); 
        
break;
case 32:
            this.$ = new Expression(undefined);
        
break;
case 33:
            this.$ = new Expression();
            this.$.type = "L";
            this.$.var_name = $$[$0];
        
break;
case 34:   
            this.$ = new Expression();
            this.$.type = "N";
            this.$.children.push($$[$0-2]);
            this.$.var_name = $$[$0];
        
break;
case 35: 
            this.$ = new Expression(String($$[$0])); 
        
break;
case 36:
            this.$ = new Expression(Number($$[$0]));
        
break;
case 37:
            var e_one = new Expression(1.0);
            this.$ = new Expression();
            this.$.type = "R";
            this.$.children.push($$[$0-3]);
            this.$.children.push(e_one);
            this.$.children.push($$[$0-1]);
        
break;
case 38:
            this.$ = new Expression();
            this.$.type = "R";
            this.$.children.push($$[$0-5]);
            this.$.children.push($$[$0-3]);
            this.$.children.push($$[$0-1]);
        
break;
case 39:
            this.$ = new Expression([]); 
        
break;
case 40:
            this.$ = $$[$0-2]; 
        
break;
case 41: 
            this.$ = new Expression();
            this.$.type = '*';
            this.$.children.push($$[$0-2]);
            this.$.children.push($$[$0]); 
        
break;
case 42: 
            this.$ = new Expression();
            this.$.type = '/';
            this.$.children.push($$[$0-2]);
            this.$.children.push($$[$0]); 
        
break;
case 43: 
            this.$ = new Expression();
            this.$.type = '%';
            this.$.children.push($$[$0-2]);
            this.$.children.push($$[$0]); 
        
break;
case 44: 
            this.$ = new Expression();
            this.$.type = '+';
            this.$.children.push($$[$0-2]);
            this.$.children.push($$[$0]); 
        
break;
case 45: 
            this.$ = new Expression();
            this.$.type = '-';
            this.$.children.push($$[$0-2]);
            this.$.children.push($$[$0]); 
        
break;
case 46: 
            this.$ = new Expression();
            this.$.type = '<';
            this.$.children.push($$[$0-2]);
            this.$.children.push($$[$0]); 
        
break;
case 47: 
            this.$ = new Expression();
            this.$.type = '<=';
            this.$.children.push($$[$0-2]);
            this.$.children.push($$[$0]); 
        
break;
case 48: 
            this.$ = new Expression();
            this.$.type = '==';
            this.$.children.push($$[$0-2]);
            this.$.children.push($$[$0]); 
        
break;
case 49: 
            this.$ = new Expression();
            this.$.type = '!=';
            this.$.children.push($$[$0-2]);
            this.$.children.push($$[$0]); 
        
break;
case 50: 
            this.$ = new Expression();
            this.$.type = '>=';
            this.$.children.push($$[$0-2]);
            this.$.children.push($$[$0]); 
        
break;
case 51: 
            this.$ = new Expression();
            this.$.type = '>';
            this.$.children.push($$[$0-2]);
            this.$.children.push($$[$0]); 
        
break;
case 52: 
            this.$ = new Expression();
            this.$.type = '&&';
            this.$.children.push($$[$0-2]);
            this.$.children.push($$[$0]); 
        
break;
case 53: 
            this.$ = new Expression();
            this.$.type = '||';
            this.$.children.push($$[$0-2]);
            this.$.children.push($$[$0]); 
        
break;
case 54: 
            this.$ = $$[$0]; 
        
break;
case 55: 
            this.$ = new Expression();
            this.$.type = 'I';
            this.$.children.push($$[$0]);
        
break;
case 56: 
            this.$ = new Expression();
            this.$.type = '!';
            this.$.children.push($$[$0]);
        
break;
case 57: this.$ = $$[$0-1]; 
break;
case 58: 
            this.$ = new Expression();
            this.$.type = '?:';
            this.$.children.push($$[$0-4]);
            this.$.children.push($$[$0-2]);
            this.$.children.push($$[$0]);
        
break;
case 59: 
            this.$ = new Expression();
            this.$.type = '[]';
            this.$.children.push($$[$0-3]);
            this.$.children.push($$[$0-1]);
        
break;
case 60: 
            this.$ = new Expression();
            this.$.type = 'F';
            this.$.call_funcname = $$[$0-3];
            this.$.call_argnames = $$[$0-1].argnames;
            this.$.children = $$[$0-1].argexpr;
            delete $$[$0-1];
        
break;
case 63: 
            this.$ = new Expression();
            this.$.type = 'V';
            this.$.children.push($$[$0]);
        
break;
case 64:   
            this.$ = $$[$0-3];
            this.$.children.push($$[$0]);
        
break;
case 65:
            this.$ = new ext.ArgsContainer();
        
break;
case 66:
            this.$ = new ext.ArgsContainer();
            this.$.argnames.push($$[$0].argname);
            this.$.argexpr.push($$[$0].argexpr);
            delete $$[$0];
        
break;
case 67:
            this.$ = $$[$0-3];
            this.$.argnames.push($$[$0].argname);
            this.$.argexpr.push($$[$0].argexpr);
            delete $$[$0];
        
break;
case 68:
            this.$ = new ext.ArgContainer();
            this.$.argname = $$[$0];
            this.$.argexpr = undefined;
        
break;
case 69:
            this.$ = new ext.ArgContainer();
            this.$.argname = $$[$0-2];
            this.$.argexpr = $$[$0];
        
break;
case 70:
            this.$ = new ext.ArgsContainer();
        
break;
case 71: 
            this.$ = new ext.ArgsContainer();
            this.$.argnames.push($$[$0].argname);
            this.$.argexpr.push($$[$0].argexpr);
            delete $$[$0];
        
break;
case 72: 
            this.$ = $$[$0-3];
            this.$.argnames.push($$[$0].argname);
            this.$.argexpr.push($$[$0].argexpr);
            delete $$[$0];
        
break;
case 73: 
            this.$ = new ext.ArgContainer();
            this.$.argexpr = $$[$0];
        
break;
case 74: 
            this.$ = new ext.ArgContainer();
            this.$.argname = $$[$0-2];
            this.$.argexpr = $$[$0];
        
break;
}
},
table: [{1:[2,2],3:1,4:2,9:[2,2],10:[2,2],15:[2,2],16:[2,2],21:[2,2],22:[2,2],26:[2,2],31:[2,2],32:[2,2],33:[2,2],34:[2,2]},{1:[3]},{1:[2,1],5:3,7:4,9:[1,5],10:[2,7],15:[2,7],16:[2,7],21:[2,7],22:[2,7],26:[2,7],31:[2,7],32:[2,7],33:[2,7],34:[2,7]},{1:[2,3],9:[2,3],10:[2,3],15:[2,3],16:[2,3],21:[2,3],22:[2,3],26:[2,3],31:[2,3],32:[2,3],33:[2,3],34:[2,3]},{8:6,10:[1,10],15:[1,7],16:[1,8],18:9,21:[1,11],22:[1,12],25:19,26:[1,20],27:14,29:13,31:[1,15],32:[1,16],33:[1,17],34:[1,18]},{10:[1,21]},{1:[2,6],9:[2,6],10:[2,6],15:[2,6],16:[2,6],17:[2,6],21:[2,6],22:[2,6],26:[2,6],31:[2,6],32:[2,6],33:[2,6],34:[2,6]},{1:[2,9],9:[2,9],10:[2,9],15:[2,9],16:[2,9],17:[2,9],21:[2,9],22:[2,9],26:[2,9],31:[2,9],32:[2,9],33:[2,9],34:[2,9]},{6:22,9:[2,4],10:[2,4],15:[2,4],16:[2,4],17:[2,4],21:[2,4],22:[2,4],26:[2,4],31:[2,4],32:[2,4],33:[2,4],34:[2,4]},{1:[2,11],9:[2,11],10:[2,11],15:[2,11],16:[2,11],17:[2,11],21:[2,11],22:[2,11],26:[2,11],31:[2,11],32:[2,11],33:[2,11],34:[2,11]},{11:[1,24],19:[1,23]},{10:[1,25]},{1:[2,14],9:[2,14],10:[2,14],15:[2,14],16:[2,14],17:[2,14],21:[2,14],22:[2,14],26:[2,14],31:[2,14],32:[2,14],33:[2,14],34:[2,14]},{10:[1,30],15:[1,26],16:[1,29],18:28,23:27,25:19,26:[1,20],27:14,29:13,31:[1,15],32:[1,16],33:[1,17],34:[1,18]},{1:[2,22],9:[2,22],10:[2,22],15:[2,22],16:[2,22],17:[2,22],21:[2,22],22:[2,22],26:[2,22],28:[2,22],31:[2,22],32:[2,22],33:[2,22],34:[2,22]},{10:[1,30],29:31,31:[1,15],32:[1,16],33:[1,17],34:[1,18]},{10:[1,30],29:32,31:[1,15],32:[1,16],33:[1,17],34:[1,18]},{10:[1,30],29:33,31:[1,15],32:[1,16],33:[1,17],34:[1,18]},{10:[1,30],29:34,31:[1,15],32:[1,16],33:[1,17],34:[1,18]},{1:[2,18],9:[2,18],10:[2,18],15:[2,18],16:[2,18],17:[2,18],21:[2,18],22:[2,18],26:[2,18],28:[1,35],31:[2,18],32:[2,18],33:[2,18],34:[2,18]},{11:[1,36]},{11:[1,37]},{5:39,7:4,9:[1,5],10:[2,7],15:[2,7],16:[2,7],17:[1,38],21:[2,7],22:[2,7],26:[2,7],31:[2,7],32:[2,7],33:[2,7],34:[2,7]},{10:[1,44],11:[1,51],20:40,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{10:[1,55],11:[1,51],14:[2,70],20:54,30:52,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49],57:[2,70],59:53},{11:[1,56]},{1:[2,20],9:[2,20],10:[2,20],15:[2,20],16:[2,20],17:[2,20],21:[2,20],22:[2,20],26:[2,20],28:[2,20],31:[2,20],32:[2,20],33:[2,20],34:[2,20]},{1:[2,21],9:[2,21],10:[2,21],15:[2,21],16:[2,21],17:[2,21],21:[2,21],22:[2,21],26:[2,21],28:[2,21],31:[2,21],32:[2,21],33:[2,21],34:[2,21]},{1:[2,15],9:[2,15],10:[2,15],15:[2,15],16:[2,15],17:[2,15],21:[2,15],22:[2,15],26:[2,15],28:[2,15],31:[2,15],32:[2,15],33:[2,15],34:[2,15]},{10:[2,23],17:[2,23],24:57,26:[2,23],31:[2,23],32:[2,23],33:[2,23],34:[2,23]},{11:[1,24]},{10:[2,26],15:[2,26],16:[2,26],26:[2,26],31:[2,26],32:[2,26],33:[2,26],34:[2,26]},{10:[2,27],15:[2,27],16:[2,27],26:[2,27],31:[2,27],32:[2,27],33:[2,27],34:[2,27]},{10:[2,28],15:[2,28],16:[2,28],26:[2,28],31:[2,28],32:[2,28],33:[2,28],34:[2,28]},{10:[2,29],15:[2,29],16:[2,29],26:[2,29],31:[2,29],32:[2,29],33:[2,29],34:[2,29]},{10:[1,30],16:[1,29],18:28,23:58,25:19,26:[1,20],27:14,29:13,31:[1,15],32:[1,16],33:[1,17],34:[1,18]},{10:[1,44],11:[1,51],20:59,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{10:[1,62],12:60,14:[2,65],57:[2,65],58:61},{1:[2,10],9:[2,10],10:[2,10],15:[2,10],16:[2,10],17:[2,10],21:[2,10],22:[2,10],26:[2,10],31:[2,10],32:[2,10],33:[2,10],34:[2,10]},{9:[2,5],10:[2,5],15:[2,5],16:[2,5],17:[2,5],21:[2,5],22:[2,5],26:[2,5],31:[2,5],32:[2,5],33:[2,5],34:[2,5]},{15:[1,63],33:[1,67],34:[1,65],38:[1,64],41:[1,79],45:[1,66],46:[1,68],47:[1,69],48:[1,70],49:[1,71],50:[1,72],51:[1,73],52:[1,74],53:[1,75],54:[1,76],55:[1,77],56:[1,78]},{14:[2,30],15:[2,30],33:[2,30],34:[2,30],38:[2,30],41:[2,30],42:[2,30],43:[2,30],45:[2,30],46:[2,30],47:[2,30],48:[2,30],49:[2,30],50:[2,30],51:[2,30],52:[2,30],53:[2,30],54:[2,30],55:[2,30],56:[2,30],57:[2,30]},{14:[2,31],15:[2,31],33:[2,31],34:[2,31],38:[2,31],41:[2,31],42:[2,31],43:[2,31],45:[2,31],46:[2,31],47:[2,31],48:[2,31],49:[2,31],50:[2,31],51:[2,31],52:[2,31],53:[2,31],54:[2,31],55:[2,31],56:[2,31],57:[2,31]},{14:[2,32],15:[2,32],33:[2,32],34:[2,32],38:[2,32],41:[2,32],42:[2,32],43:[2,32],45:[2,32],46:[2,32],47:[2,32],48:[2,32],49:[2,32],50:[2,32],51:[2,32],52:[2,32],53:[2,32],54:[2,32],55:[2,32],56:[2,32],57:[2,32]},{11:[1,80],14:[2,33],15:[2,33],33:[2,33],34:[2,33],38:[2,33],41:[2,33],42:[2,33],43:[2,33],45:[2,33],46:[2,33],47:[2,33],48:[2,33],49:[2,33],50:[2,33],51:[2,33],52:[2,33],53:[2,33],54:[2,33],55:[2,33],56:[2,33],57:[2,33]},{14:[2,35],15:[2,35],33:[2,35],34:[2,35],38:[2,35],41:[2,35],42:[2,35],43:[2,35],45:[2,35],46:[2,35],47:[2,35],48:[2,35],49:[2,35],50:[2,35],51:[2,35],52:[2,35],53:[2,35],54:[2,35],55:[2,35],56:[2,35],57:[2,35]},{14:[2,36],15:[2,36],33:[2,36],34:[2,36],38:[2,36],41:[2,36],42:[2,36],43:[2,36],45:[2,36],46:[2,36],47:[2,36],48:[2,36],49:[2,36],50:[2,36],51:[2,36],52:[2,36],53:[2,36],54:[2,36],55:[2,36],56:[2,36],57:[2,36]},{10:[1,44],11:[1,51],13:82,20:81,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],43:[2,62],44:83,46:[1,48],47:[1,49],57:[1,84]},{10:[1,44],11:[1,51],20:85,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{10:[1,44],11:[1,51],20:86,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{10:[1,44],11:[1,51],20:87,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{10:[1,44],11:[1,51],20:88,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{14:[1,89],57:[1,90]},{14:[2,71],57:[2,71]},{14:[2,73],33:[1,67],34:[1,65],38:[1,64],41:[1,79],45:[1,66],46:[1,68],47:[1,69],48:[1,70],49:[1,71],50:[1,72],51:[1,73],52:[1,74],53:[1,75],54:[1,76],55:[1,77],56:[1,78],57:[2,73]},{11:[1,80],14:[2,33],19:[1,91],33:[2,33],34:[2,33],38:[2,33],41:[2,33],45:[2,33],46:[2,33],47:[2,33],48:[2,33],49:[2,33],50:[2,33],51:[2,33],52:[2,33],53:[2,33],54:[2,33],55:[2,33],56:[2,33],57:[2,33]},{10:[1,62],12:92,14:[2,65],57:[2,65],58:61},{10:[1,30],17:[1,93],18:94,25:19,26:[1,20],27:14,29:13,31:[1,15],32:[1,16],33:[1,17],34:[1,18]},{1:[2,19],9:[2,19],10:[2,19],15:[2,19],16:[2,19],17:[2,19],21:[2,19],22:[2,19],26:[2,19],28:[2,19],31:[2,19],32:[2,19],33:[2,19],34:[2,19]},{14:[1,95],33:[1,67],34:[1,65],38:[1,64],41:[1,79],45:[1,66],46:[1,68],47:[1,69],48:[1,70],49:[1,71],50:[1,72],51:[1,73],52:[1,74],53:[1,75],54:[1,76],55:[1,77],56:[1,78]},{13:96,14:[2,62],57:[1,97]},{14:[2,66],57:[2,66]},{14:[2,68],19:[1,98],57:[2,68]},{1:[2,12],9:[2,12],10:[2,12],15:[2,12],16:[2,12],17:[2,12],21:[2,12],22:[2,12],26:[2,12],31:[2,12],32:[2,12],33:[2,12],34:[2,12]},{10:[1,99]},{10:[1,44],11:[1,51],20:100,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{10:[1,44],11:[1,51],20:101,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{10:[1,44],11:[1,51],20:102,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{10:[1,44],11:[1,51],20:103,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{10:[1,44],11:[1,51],20:104,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{10:[1,44],11:[1,51],20:105,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{10:[1,44],11:[1,51],20:106,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{10:[1,44],11:[1,51],20:107,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{10:[1,44],11:[1,51],20:108,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{10:[1,44],11:[1,51],20:109,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{10:[1,44],11:[1,51],20:110,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{10:[1,44],11:[1,51],20:111,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{10:[1,44],11:[1,51],20:112,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{10:[1,44],11:[1,51],20:113,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{10:[1,44],11:[1,51],20:114,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{10:[1,55],11:[1,51],14:[2,70],20:54,30:115,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49],57:[2,70],59:53},{33:[1,67],34:[1,65],38:[1,64],41:[1,79],42:[1,116],43:[2,63],45:[1,66],46:[1,68],47:[1,69],48:[1,70],49:[1,71],50:[1,72],51:[1,73],52:[1,74],53:[1,75],54:[1,76],55:[1,77],56:[1,78],57:[2,63]},{43:[1,117]},{13:118,43:[2,62],57:[1,119]},{10:[2,62],11:[2,62],13:120,14:[2,62],31:[2,62],35:[2,62],36:[2,62],37:[2,62],39:[2,62],40:[2,62],41:[2,62],43:[2,62],46:[2,62],47:[2,62],57:[1,84]},{14:[2,54],15:[2,54],33:[1,67],34:[1,65],38:[1,64],41:[1,79],42:[2,54],43:[2,54],45:[1,66],46:[2,54],47:[2,54],48:[2,54],49:[2,54],50:[2,54],51:[2,54],52:[2,54],53:[2,54],54:[2,54],55:[2,54],56:[2,54],57:[2,54]},{14:[2,55],15:[2,55],33:[1,67],34:[1,65],38:[1,64],41:[1,79],42:[2,55],43:[2,55],45:[1,66],46:[2,55],47:[2,55],48:[2,55],49:[2,55],50:[2,55],51:[2,55],52:[2,55],53:[2,55],54:[2,55],55:[2,55],56:[2,55],57:[2,55]},{14:[2,56],15:[2,56],33:[1,67],34:[1,65],38:[1,64],41:[1,79],42:[2,56],43:[2,56],45:[1,66],46:[2,56],47:[2,56],48:[2,56],49:[2,56],50:[2,56],51:[2,56],52:[2,56],53:[2,56],54:[2,56],55:[2,56],56:[2,56],57:[2,56]},{14:[1,121],33:[1,67],34:[1,65],38:[1,64],41:[1,79],45:[1,66],46:[1,68],47:[1,69],48:[1,70],49:[1,71],50:[1,72],51:[1,73],52:[1,74],53:[1,75],54:[1,76],55:[1,77],56:[1,78]},{10:[2,25],15:[2,25],16:[2,25],26:[2,25],31:[2,25],32:[2,25],33:[2,25],34:[2,25]},{10:[2,62],11:[2,62],13:122,31:[2,62],35:[2,62],36:[2,62],37:[2,62],39:[2,62],40:[2,62],41:[2,62],46:[2,62],47:[2,62],57:[1,84]},{10:[1,44],11:[1,51],20:123,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{13:124,14:[2,62],57:[1,97]},{1:[2,16],9:[2,16],10:[2,16],15:[2,16],16:[2,16],17:[2,16],21:[2,16],22:[2,16],26:[2,16],28:[2,16],31:[2,16],32:[2,16],33:[2,16],34:[2,16]},{10:[2,24],17:[2,24],26:[2,24],31:[2,24],32:[2,24],33:[2,24],34:[2,24]},{10:[1,30],16:[1,29],18:28,23:125,25:19,26:[1,20],27:14,29:13,31:[1,15],32:[1,16],33:[1,17],34:[1,18]},{14:[1,126]},{10:[2,62],13:127,14:[2,62],57:[1,84]},{10:[1,44],11:[1,51],20:128,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{14:[2,34],15:[2,34],33:[2,34],34:[2,34],38:[2,34],41:[2,34],42:[2,34],43:[2,34],45:[2,34],46:[2,34],47:[2,34],48:[2,34],49:[2,34],50:[2,34],51:[2,34],52:[2,34],53:[2,34],54:[2,34],55:[2,34],56:[2,34],57:[2,34]},{14:[2,41],15:[2,41],33:[2,41],34:[2,41],38:[1,64],41:[1,79],42:[2,41],43:[2,41],45:[2,41],46:[2,41],47:[2,41],48:[2,41],49:[2,41],50:[2,41],51:[2,41],52:[2,41],53:[2,41],54:[2,41],55:[2,41],56:[2,41],57:[2,41]},{14:[2,42],15:[2,42],33:[2,42],34:[2,42],38:[1,64],41:[1,79],42:[2,42],43:[2,42],45:[2,42],46:[2,42],47:[2,42],48:[2,42],49:[2,42],50:[2,42],51:[2,42],52:[2,42],53:[2,42],54:[2,42],55:[2,42],56:[2,42],57:[2,42]},{14:[2,43],15:[2,43],33:[2,43],34:[2,43],38:[1,64],41:[1,79],42:[2,43],43:[2,43],45:[2,43],46:[2,43],47:[2,43],48:[2,43],49:[2,43],50:[2,43],51:[2,43],52:[2,43],53:[2,43],54:[2,43],55:[2,43],56:[2,43],57:[2,43]},{14:[2,44],15:[2,44],33:[1,67],34:[1,65],38:[1,64],41:[1,79],42:[2,44],43:[2,44],45:[1,66],46:[2,44],47:[2,44],48:[2,44],49:[2,44],50:[2,44],51:[2,44],52:[2,44],53:[2,44],54:[2,44],55:[2,44],56:[2,44],57:[2,44]},{14:[2,45],15:[2,45],33:[1,67],34:[1,65],38:[1,64],41:[1,79],42:[2,45],43:[2,45],45:[1,66],46:[2,45],47:[2,45],48:[2,45],49:[2,45],50:[2,45],51:[2,45],52:[2,45],53:[2,45],54:[2,45],55:[2,45],56:[2,45],57:[2,45]},{14:[2,46],15:[2,46],33:[1,67],34:[1,65],38:[1,64],41:[1,79],42:[2,46],43:[2,46],45:[1,66],46:[1,68],47:[1,69],48:[2,46],49:[2,46],50:[1,72],51:[1,73],52:[2,46],53:[2,46],54:[2,46],55:[2,46],56:[2,46],57:[2,46]},{14:[2,47],15:[2,47],33:[1,67],34:[1,65],38:[1,64],41:[1,79],42:[2,47],43:[2,47],45:[1,66],46:[1,68],47:[1,69],48:[2,47],49:[2,47],50:[1,72],51:[1,73],52:[2,47],53:[2,47],54:[2,47],55:[2,47],56:[2,47],57:[2,47]},{14:[2,48],15:[2,48],33:[1,67],34:[1,65],38:[1,64],41:[1,79],42:[2,48],43:[2,48],45:[1,66],46:[1,68],47:[1,69],48:[2,48],49:[2,48],50:[2,48],51:[2,48],52:[2,48],53:[2,48],54:[2,48],55:[2,48],56:[2,48],57:[2,48]},{14:[2,49],15:[2,49],33:[1,67],34:[1,65],38:[1,64],41:[1,79],42:[2,49],43:[2,49],45:[1,66],46:[1,68],47:[1,69],48:[2,49],49:[2,49],50:[2,49],51:[2,49],52:[2,49],53:[2,49],54:[2,49],55:[2,49],56:[2,49],57:[2,49]},{14:[2,50],15:[2,50],33:[1,67],34:[1,65],38:[1,64],41:[1,79],42:[2,50],43:[2,50],45:[1,66],46:[1,68],47:[1,69],48:[2,50],49:[2,50],50:[1,72],51:[1,73],52:[2,50],53:[2,50],54:[2,50],55:[2,50],56:[2,50],57:[2,50]},{14:[2,51],15:[2,51],33:[1,67],34:[1,65],38:[1,64],41:[1,79],42:[2,51],43:[2,51],45:[1,66],46:[1,68],47:[1,69],48:[2,51],49:[2,51],50:[1,72],51:[1,73],52:[2,51],53:[2,51],54:[2,51],55:[2,51],56:[2,51],57:[2,51]},{14:[2,52],15:[2,52],33:[1,67],34:[1,65],38:[1,64],41:[1,79],42:[2,52],43:[2,52],45:[1,66],46:[1,68],47:[1,69],48:[1,70],49:[1,71],50:[1,72],51:[1,73],52:[1,74],53:[1,75],54:[2,52],55:[2,52],56:[2,52],57:[2,52]},{14:[2,53],15:[2,53],33:[1,67],34:[1,65],38:[1,64],41:[1,79],42:[2,53],43:[2,53],45:[1,66],46:[1,68],47:[1,69],48:[1,70],49:[1,71],50:[1,72],51:[1,73],52:[1,74],53:[1,75],54:[1,76],55:[2,53],56:[2,53],57:[2,53]},{33:[1,67],34:[1,65],38:[1,64],41:[1,79],42:[1,129],45:[1,66],46:[1,68],47:[1,69],48:[1,70],49:[1,71],50:[1,72],51:[1,73],52:[1,74],53:[1,75],54:[1,76],55:[1,77],56:[1,78]},{33:[1,67],34:[1,65],38:[1,64],41:[1,79],43:[1,130],45:[1,66],46:[1,68],47:[1,69],48:[1,70],49:[1,71],50:[1,72],51:[1,73],52:[1,74],53:[1,75],54:[1,76],55:[1,77],56:[1,78]},{14:[1,131],57:[1,90]},{10:[1,44],11:[1,51],20:132,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{14:[2,39],15:[2,39],33:[2,39],34:[2,39],38:[2,39],41:[2,39],42:[2,39],43:[2,39],45:[2,39],46:[2,39],47:[2,39],48:[2,39],49:[2,39],50:[2,39],51:[2,39],52:[2,39],53:[2,39],54:[2,39],55:[2,39],56:[2,39],57:[2,39]},{43:[1,133]},{10:[2,62],11:[2,62],13:134,31:[2,62],35:[2,62],36:[2,62],37:[2,62],39:[2,62],40:[2,62],41:[2,62],43:[2,62],46:[2,62],47:[2,62],57:[1,84]},{10:[2,61],11:[2,61],14:[2,61],31:[2,61],35:[2,61],36:[2,61],37:[2,61],39:[2,61],40:[2,61],41:[2,61],43:[2,61],46:[2,61],47:[2,61]},{14:[2,57],15:[2,57],33:[2,57],34:[2,57],38:[2,57],41:[2,57],42:[2,57],43:[2,57],45:[2,57],46:[2,57],47:[2,57],48:[2,57],49:[2,57],50:[2,57],51:[2,57],52:[2,57],53:[2,57],54:[2,57],55:[2,57],56:[2,57],57:[2,57]},{10:[1,55],11:[1,51],20:54,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49],59:135},{14:[2,74],33:[1,67],34:[1,65],38:[1,64],41:[1,79],45:[1,66],46:[1,68],47:[1,69],48:[1,70],49:[1,71],50:[1,72],51:[1,73],52:[1,74],53:[1,75],54:[1,76],55:[1,77],56:[1,78],57:[2,74]},{14:[1,136]},{1:[2,17],9:[2,17],10:[2,17],15:[2,17],16:[2,17],17:[2,17],21:[2,17],22:[2,17],26:[2,17],28:[2,17],31:[2,17],32:[2,17],33:[2,17],34:[2,17]},{10:[2,8],15:[2,8],16:[2,8],21:[2,8],22:[2,8],26:[2,8],31:[2,8],32:[2,8],33:[2,8],34:[2,8]},{10:[1,62],14:[2,61],58:137},{14:[2,69],33:[1,67],34:[1,65],38:[1,64],41:[1,79],45:[1,66],46:[1,68],47:[1,69],48:[1,70],49:[1,71],50:[1,72],51:[1,73],52:[1,74],53:[1,75],54:[1,76],55:[1,77],56:[1,78],57:[2,69]},{10:[1,44],11:[1,51],20:138,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{14:[2,59],15:[2,59],33:[2,59],34:[2,59],38:[2,59],41:[2,59],42:[2,59],43:[2,59],45:[2,59],46:[2,59],47:[2,59],48:[2,59],49:[2,59],50:[2,59],51:[2,59],52:[2,59],53:[2,59],54:[2,59],55:[2,59],56:[2,59],57:[2,59]},{14:[2,60],15:[2,60],33:[2,60],34:[2,60],38:[2,60],41:[2,60],42:[2,60],43:[2,60],45:[2,60],46:[2,60],47:[2,60],48:[2,60],49:[2,60],50:[2,60],51:[2,60],52:[2,60],53:[2,60],54:[2,60],55:[2,60],56:[2,60],57:[2,60]},{33:[1,67],34:[1,65],38:[1,64],41:[1,79],42:[1,140],43:[1,139],45:[1,66],46:[1,68],47:[1,69],48:[1,70],49:[1,71],50:[1,72],51:[1,73],52:[1,74],53:[1,75],54:[1,76],55:[1,77],56:[1,78]},{14:[2,40],15:[2,40],33:[2,40],34:[2,40],38:[2,40],41:[2,40],42:[2,40],43:[2,40],45:[2,40],46:[2,40],47:[2,40],48:[2,40],49:[2,40],50:[2,40],51:[2,40],52:[2,40],53:[2,40],54:[2,40],55:[2,40],56:[2,40],57:[2,40]},{10:[1,44],11:[1,51],20:141,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],43:[2,61],46:[1,48],47:[1,49]},{14:[2,72],57:[2,72]},{19:[1,142]},{14:[2,67],57:[2,67]},{14:[2,58],15:[2,58],33:[1,67],34:[1,65],38:[1,64],41:[1,79],42:[2,58],43:[2,58],45:[1,66],46:[1,68],47:[1,69],48:[1,70],49:[1,71],50:[1,72],51:[1,73],52:[1,74],53:[1,75],54:[1,76],55:[1,77],56:[1,78],57:[2,58]},{14:[2,37],15:[2,37],33:[2,37],34:[2,37],38:[2,37],41:[2,37],42:[2,37],43:[2,37],45:[2,37],46:[2,37],47:[2,37],48:[2,37],49:[2,37],50:[2,37],51:[2,37],52:[2,37],53:[2,37],54:[2,37],55:[2,37],56:[2,37],57:[2,37]},{10:[1,44],11:[1,51],20:143,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{33:[1,67],34:[1,65],38:[1,64],41:[1,79],43:[2,64],45:[1,66],46:[1,68],47:[1,69],48:[1,70],49:[1,71],50:[1,72],51:[1,73],52:[1,74],53:[1,75],54:[1,76],55:[1,77],56:[1,78],57:[2,64]},{10:[1,44],11:[1,51],20:144,31:[1,50],35:[1,41],36:[1,42],37:[1,43],39:[1,45],40:[1,46],41:[1,47],46:[1,48],47:[1,49]},{33:[1,67],34:[1,65],38:[1,64],41:[1,79],43:[1,145],45:[1,66],46:[1,68],47:[1,69],48:[1,70],49:[1,71],50:[1,72],51:[1,73],52:[1,74],53:[1,75],54:[1,76],55:[1,77],56:[1,78]},{15:[1,146],33:[1,67],34:[1,65],38:[1,64],41:[1,79],45:[1,66],46:[1,68],47:[1,69],48:[1,70],49:[1,71],50:[1,72],51:[1,73],52:[1,74],53:[1,75],54:[1,76],55:[1,77],56:[1,78]},{14:[2,38],15:[2,38],33:[2,38],34:[2,38],38:[2,38],41:[2,38],42:[2,38],43:[2,38],45:[2,38],46:[2,38],47:[2,38],48:[2,38],49:[2,38],50:[2,38],51:[2,38],52:[2,38],53:[2,38],54:[2,38],55:[2,38],56:[2,38],57:[2,38]},{1:[2,13],9:[2,13],10:[2,13],15:[2,13],16:[2,13],17:[2,13],21:[2,13],22:[2,13],26:[2,13],31:[2,13],32:[2,13],33:[2,13],34:[2,13]}],
defaultActions: {},
parseError: function parseError(str, hash) {
    throw new Error(str);
},
parse: function parse(input) {
    var self = this, stack = [0], vstack = [null], lstack = [], table = this.table, yytext = "", yylineno = 0, yyleng = 0, recovering = 0, TERROR = 2, EOF = 1;
    this.lexer.setInput(input);
    this.lexer.yy = this.yy;
    this.yy.lexer = this.lexer;
    this.yy.parser = this;
    if (typeof this.lexer.yylloc == "undefined")
        this.lexer.yylloc = {};
    var yyloc = this.lexer.yylloc;
    lstack.push(yyloc);
    var ranges = this.lexer.options && this.lexer.options.ranges;
    if (typeof this.yy.parseError === "function")
        this.parseError = this.yy.parseError;
    function popStack(n) {
        stack.length = stack.length - 2 * n;
        vstack.length = vstack.length - n;
        lstack.length = lstack.length - n;
    }
    function lex() {
        var token;
        token = self.lexer.lex() || 1;
        if (typeof token !== "number") {
            token = self.symbols_[token] || token;
        }
        return token;
    }
    var symbol, preErrorSymbol, state, action, a, r, yyval = {}, p, len, newState, expected;
    while (true) {
        state = stack[stack.length - 1];
        if (this.defaultActions[state]) {
            action = this.defaultActions[state];
        } else {
            if (symbol === null || typeof symbol == "undefined") {
                symbol = lex();
            }
            action = table[state] && table[state][symbol];
        }
        if (typeof action === "undefined" || !action.length || !action[0]) {
            var errStr = "";
            if (!recovering) {
                expected = [];
                for (p in table[state])
                    if (this.terminals_[p] && p > 2) {
                        expected.push("'" + this.terminals_[p] + "'");
                    }
                if (this.lexer.showPosition) {
                    errStr = "Parse error on line " + (yylineno + 1) + ":\n" + this.lexer.showPosition() + "\nExpecting " + expected.join(", ") + ", got '" + (this.terminals_[symbol] || symbol) + "'";
                } else {
                    errStr = "Parse error on line " + (yylineno + 1) + ": Unexpected " + (symbol == 1?"end of input":"'" + (this.terminals_[symbol] || symbol) + "'");
                }
                this.parseError(errStr, {text: this.lexer.match, token: this.terminals_[symbol] || symbol, line: this.lexer.yylineno, loc: yyloc, expected: expected});
            }
        }
        if (action[0] instanceof Array && action.length > 1) {
            throw new Error("Parse Error: multiple actions possible at state: " + state + ", token: " + symbol);
        }
        switch (action[0]) {
        case 1:
            stack.push(symbol);
            vstack.push(this.lexer.yytext);
            lstack.push(this.lexer.yylloc);
            stack.push(action[1]);
            symbol = null;
            if (!preErrorSymbol) {
                yyleng = this.lexer.yyleng;
                yytext = this.lexer.yytext;
                yylineno = this.lexer.yylineno;
                yyloc = this.lexer.yylloc;
                if (recovering > 0)
                    recovering--;
            } else {
                symbol = preErrorSymbol;
                preErrorSymbol = null;
            }
            break;
        case 2:
            len = this.productions_[action[1]][1];
            yyval.$ = vstack[vstack.length - len];
            yyval._$ = {first_line: lstack[lstack.length - (len || 1)].first_line, last_line: lstack[lstack.length - 1].last_line, first_column: lstack[lstack.length - (len || 1)].first_column, last_column: lstack[lstack.length - 1].last_column};
            if (ranges) {
                yyval._$.range = [lstack[lstack.length - (len || 1)].range[0], lstack[lstack.length - 1].range[1]];
            }
            r = this.performAction.call(yyval, yytext, yyleng, yylineno, this.yy, action[1], vstack, lstack);
            if (typeof r !== "undefined") {
                return r;
            }
            if (len) {
                stack = stack.slice(0, -1 * len * 2);
                vstack = vstack.slice(0, -1 * len);
                lstack = lstack.slice(0, -1 * len);
            }
            stack.push(this.productions_[action[1]][0]);
            vstack.push(yyval.$);
            lstack.push(yyval._$);
            newState = table[stack[stack.length - 2]][stack[stack.length - 1]];
            stack.push(newState);
            break;
        case 3:
            return true;
        }
    }
    return true;
}
};
/* Jison generated lexer */
var lexer = (function(){
var lexer = ({EOF:1,
parseError:function parseError(str, hash) {
        if (this.yy.parser) {
            this.yy.parser.parseError(str, hash);
        } else {
            throw new Error(str);
        }
    },
setInput:function (input) {
        this._input = input;
        this._more = this._less = this.done = false;
        this.yylineno = this.yyleng = 0;
        this.yytext = this.matched = this.match = '';
        this.conditionStack = ['INITIAL'];
        this.yylloc = {first_line:1,first_column:0,last_line:1,last_column:0};
        if (this.options.ranges) this.yylloc.range = [0,0];
        this.offset = 0;
        return this;
    },
input:function () {
        var ch = this._input[0];
        this.yytext += ch;
        this.yyleng++;
        this.offset++;
        this.match += ch;
        this.matched += ch;
        var lines = ch.match(/(?:\r\n?|\n).*/g);
        if (lines) {
            this.yylineno++;
            this.yylloc.last_line++;
        } else {
            this.yylloc.last_column++;
        }
        if (this.options.ranges) this.yylloc.range[1]++;

        this._input = this._input.slice(1);
        return ch;
    },
unput:function (ch) {
        var len = ch.length;
        var lines = ch.split(/(?:\r\n?|\n)/g);

        this._input = ch + this._input;
        this.yytext = this.yytext.substr(0, this.yytext.length-len-1);
        //this.yyleng -= len;
        this.offset -= len;
        var oldLines = this.match.split(/(?:\r\n?|\n)/g);
        this.match = this.match.substr(0, this.match.length-1);
        this.matched = this.matched.substr(0, this.matched.length-1);

        if (lines.length-1) this.yylineno -= lines.length-1;
        var r = this.yylloc.range;

        this.yylloc = {first_line: this.yylloc.first_line,
          last_line: this.yylineno+1,
          first_column: this.yylloc.first_column,
          last_column: lines ?
              (lines.length === oldLines.length ? this.yylloc.first_column : 0) + oldLines[oldLines.length - lines.length].length - lines[0].length:
              this.yylloc.first_column - len
          };

        if (this.options.ranges) {
            this.yylloc.range = [r[0], r[0] + this.yyleng - len];
        }
        return this;
    },
more:function () {
        this._more = true;
        return this;
    },
less:function (n) {
        this.unput(this.match.slice(n));
    },
pastInput:function () {
        var past = this.matched.substr(0, this.matched.length - this.match.length);
        return (past.length > 20 ? '...':'') + past.substr(-20).replace(/\n/g, "");
    },
upcomingInput:function () {
        var next = this.match;
        if (next.length < 20) {
            next += this._input.substr(0, 20-next.length);
        }
        return (next.substr(0,20)+(next.length > 20 ? '...':'')).replace(/\n/g, "");
    },
showPosition:function () {
        var pre = this.pastInput();
        var c = new Array(pre.length + 1).join("-");
        return pre + this.upcomingInput() + "\n" + c+"^";
    },
next:function () {
        if (this.done) {
            return this.EOF;
        }
        if (!this._input) this.done = true;

        var token,
            match,
            tempMatch,
            index,
            col,
            lines;
        if (!this._more) {
            this.yytext = '';
            this.match = '';
        }
        var rules = this._currentRules();
        for (var i=0;i < rules.length; i++) {
            tempMatch = this._input.match(this.rules[rules[i]]);
            if (tempMatch && (!match || tempMatch[0].length > match[0].length)) {
                match = tempMatch;
                index = i;
                if (!this.options.flex) break;
            }
        }
        if (match) {
            lines = match[0].match(/(?:\r\n?|\n).*/g);
            if (lines) this.yylineno += lines.length;
            this.yylloc = {first_line: this.yylloc.last_line,
                           last_line: this.yylineno+1,
                           first_column: this.yylloc.last_column,
                           last_column: lines ? lines[lines.length-1].length-lines[lines.length-1].match(/\r?\n?/)[0].length : this.yylloc.last_column + match[0].length};
            this.yytext += match[0];
            this.match += match[0];
            this.matches = match;
            this.yyleng = this.yytext.length;
            if (this.options.ranges) {
                this.yylloc.range = [this.offset, this.offset += this.yyleng];
            }
            this._more = false;
            this._input = this._input.slice(match[0].length);
            this.matched += match[0];
            token = this.performAction.call(this, this.yy, this, rules[index],this.conditionStack[this.conditionStack.length-1]);
            if (this.done && this._input) this.done = false;
            if (token) return token;
            else return;
        }
        if (this._input === "") {
            return this.EOF;
        } else {
            return this.parseError('Lexical error on line '+(this.yylineno+1)+'. Unrecognized text.\n'+this.showPosition(),
                    {text: "", token: null, line: this.yylineno});
        }
    },
lex:function lex() {
        var r = this.next();
        if (typeof r !== 'undefined') {
            return r;
        } else {
            return this.lex();
        }
    },
begin:function begin(condition) {
        this.conditionStack.push(condition);
    },
popState:function popState() {
        return this.conditionStack.pop();
    },
_currentRules:function _currentRules() {
        return this.conditions[this.conditionStack[this.conditionStack.length-1]].rules;
    },
topState:function () {
        return this.conditionStack[this.conditionStack.length-2];
    },
pushState:function begin(condition) {
        this.begin(condition);
    }});
lexer.options = {};
lexer.performAction = function anonymous(yy,yy_,$avoiding_name_collisions,YY_START) {

var YYSTATE=YY_START
switch($avoiding_name_collisions) {
case 0:this.begin('cond_include');
break;
case 1:yy.filepath = yy_.yytext;
break;
case 2:yy.filename = yy_.yytext;
break;
case 3:  this.begin('INITIAL'); 
break;
case 4:this.begin('cond_use');
break;
case 5:yy.filename = yy_.yytext;
break;
case 6:  this.begin('INITIAL'); 
break;
case 7:return 9
break;
case 8:return 21
break;
case 9:return 26
break;
case 10:return 28
break;
case 11:return 35
break;
case 12:return 36
break;
case 13:return 37
break;
case 14:/* Ignore */
break;
case 15:/* Ignore */
break;
case 16:/* Ignore */
break;
case 17:/* Ignore */
break;
case 18:this.begin('cond_comment');
break;
case 19:  this.begin('INITIAL'); 
break;
case 20:/* Ignore */
break;
case 21:return 40
break;
case 22:return 40
break;
case 23:return 10
break;
case 24:return 40
break;
case 25:return 39  //"
break;
case 26:return 49
break;
case 27:return 52
break;
case 28:return 50
break;
case 29:return 51
break;
case 30:return 54
break;
case 31:return 55
break;
case 32:return yy_.yytext;
break;
}
};
lexer.rules = [/^(?:include[ \t\r\n>]*<)/,/^(?:[^\t\r\n>]*\/)/,/^(?:[^\t\r\n>/]+)/,/^(?:>)/,/^(?:use[ \t\r\n>]*<)/,/^(?:[^\t\r\n>]+)/,/^(?:>)/,/^(?:module\b)/,/^(?:function\b)/,/^(?:if\b)/,/^(?:else\b)/,/^(?:true\b)/,/^(?:false\b)/,/^(?:undef\b)/,/^(?:[\n])/,/^(?:[\r\t ])/,/^(?:\/\/[^\n]*\n?)/,/^(?:\/\*.*\*\/)/,/^(?:\/\*)/,/^(?:\*\/)/,/^(?:.|\n\b)/,/^(?:([0-9])*\.([0-9])+([Ee][+-]?([0-9])+)?)/,/^(?:([0-9])+\.([0-9])*([Ee][+-]?([0-9])+)?)/,/^(?:\$?[a-zA-Z0-9_]+)/,/^(?:([0-9])+([Ee][+-]?([0-9])+)?)/,/^(?:[\"\'][^\"\']*[\"\'])/,/^(?:<=)/,/^(?:>=)/,/^(?:==)/,/^(?:!=)/,/^(?:&&)/,/^(?:\|\|)/,/^(?:.)/];
lexer.conditions = {"cond_include":{"rules":[0,1,2,3,4,7,8,9,10,11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28,29,30,31,32],"inclusive":true},"cond_use":{"rules":[0,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28,29,30,31,32],"inclusive":true},"cond_comment":{"rules":[0,4,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32],"inclusive":true},"cond_string":{"rules":[0,4,7,8,9,10,11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28,29,30,31,32],"inclusive":true},"INITIAL":{"rules":[0,4,7,8,9,10,11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28,29,30,31,32],"inclusive":true}};
return lexer;})()
parser.lexer = lexer;
return parser;
});