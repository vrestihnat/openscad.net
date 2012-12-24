/* Garlicjs dist/garlic.min.js build version 1.0.1 http://garlicjs.org */
!function(a){var h=function(){this.defined="undefined"!==typeof localStorage};h.prototype={constructor:h,get:function(b,a){return localStorage.getItem(b)?localStorage.getItem(b):"undefined"!==typeof a?a:null},has:function(b){return localStorage.getItem(b)?!0:!1},set:function(b,a,d){"string"===typeof a&&""!==a&&localStorage.setItem(b,a);return"function"===typeof d?d():!0},destroy:function(a,c){localStorage.removeItem(a);return"function"===typeof c?c():!0},clean:function(a){for(var c=localStorage.length-
1;0<=c;c--)-1!==localStorage.key(c).indexOf("garlic:")&&localStorage.removeItem(localStorage.key(c));return"function"===typeof a?a():!0},clear:function(a){localStorage.clear();return"function"===typeof a?a():!0}};var i=function(a,c,d){this.init("garlic",a,c,d)};i.prototype={constructor:i,init:function(b,c,d,e){this.type=b;this.$element=a(c);this.options=this.getOptions(e);this.storage=d;this.path=this.getPath();this.parentForm=this.$element.closest("form");this.retrieve();this.$element.on(this.options.events.join("."+
this.type+" "),!1,a.proxy(this.persist,this));if(this.options.destroy)this.$element.closest("form").on("submit reset",!1,a.proxy(this.destroy,this));this.$element.addClass("garlic-auto-save")},getOptions:function(b){return b=a.extend({},a.fn[this.type].defaults,b,this.$element.data())},persist:function(){if(this.$element.is("input[type=checkbox]"))return this.storage.set(this.path,this.$element.attr("checked")?"checked":"unchecked");this.storage.set(this.path,this.$element.val())},retrieve:function(){if(this.storage.has(this.path)){if(this.options.conflictManager.enabled&&
this.detectConflict())return this.conflictManager();if(this.$element.is("input[type=radio], input[type=checkbox]")){if("checked"===this.storage.get(this.path)||this.storage.get(this.path)===this.$element.val())return this.$element.attr("checked",!0);"unchecked"===this.storage.get(this.path)&&this.$element.attr("checked",!1)}else this.$element.val(this.storage.get(this.path))}},detectConflict:function(){var b=this;if(this.$element.is("input[type=checkbox], input[type=radio]"))return!1;if(this.$element.val()&&
this.storage.get(this.path)!==this.$element.val()){if(this.$element.is("select")){var c=!1;this.$element.find("option").each(function(){0!==a(this).index()&&(a(this).attr("selected")&&a(this).val()!==b.storage.get(this.path))&&(c=!0)});return c}return!0}return!1},conflictManager:function(){if("function"===typeof this.options.conflictManager.onConflictDetected&&!this.options.conflictManager.onConflictDetected(this.$element,this.storage.get(this.path)))return!1;this.options.conflictManager.garlicPriority?
(this.$element.data("swap-data",this.$element.val()),this.$element.data("swap-state","garlic"),this.$element.val(this.storage.get(this.path))):(this.$element.data("swap-data",this.storage.get(this.path)),this.$element.data("swap-state","default"));this.swapHandler();this.$element.addClass("garlic-conflict-detected");this.$element.closest("input[type=submit]").attr("disabled",!0)},swapHandler:function(){var b=a(this.options.conflictManager.template);this.$element.after(b.text(this.options.conflictManager.message));
b.on("click",!1,a.proxy(this.swap,this))},swap:function(){var b=this.$element.data("swap-data");this.$element.data("swap-state","garlic"===this.$element.data("swap-state")?"default":"garlic");this.$element.data("swap-data",this.$element.val());a(this.$element).val(b)},destroy:function(){this.storage.destroy(this.path)},remove:function(){this.remove();this.$element.is("input[type=radio], input[type=checkbox]")?a(this.$element).attr("checked",!1):this.$element.val("")},getPath:function(){if(1!=this.$element.length)return!1;
for(var b="",c=this.$element.is("input[type=checkbox]"),d=this.$element;d.length;){var e=d[0],f=e.nodeName;if(!f)break;var f=f.toLowerCase(),d=d.parent(),g=d.children(f);if(a(e).is("form, input, select, textarea")||c)if(f+=a(e).attr("name")?"."+a(e).attr("name"):"",1<g.length&&!a(e).is("input[type=radio]")&&(f+=":eq("+g.index(e)+")"),b=f+(b?">"+b:""),"form"==e.nodeName.toLowerCase())break}return"garlic:"+document.domain+(this.options.domain?"*":window.location.pathname)+">"+b},getStorage:function(){return this.storage}};
a.fn.garlic=function(b,c){function d(c){var d=a(c),g=d.data("garlic"),h=a.extend({},e,d.data());if("undefined"===typeof h.storage||h.storage)if(g||d.data("garlic",g=new i(c,f,h)),"string"===typeof b&&"function"===typeof g[b])return g[b]()}var e=a.extend(!0,{},a.fn.garlic.defaults,b,this.data()),f=new h,g=!1;if(!f.defined)return!1;this.each(function(){a(this).is("form")?a(this).find(e.inputs).each(function(){g=d(a(this))}):a(this).is(e.inputs)&&(g=d(a(this)))});return"function"===typeof c?c():g};a.fn.garlic.Constructor=
i;a.fn.garlic.defaults={destroy:!0,inputs:"input, textarea, select",events:"DOMAttrModified textInput input change keypress paste focus".split(" "),domain:!1,conflictManager:{enabled:!0,garlicPriority:!0,template:'<span class="garlic-swap"></span>',message:"This is your saved data. Click here to see default one",onConflictDetected:function(){return!0}}};a(window).on("load",function(){a('[data-persist="garlic"]').each(function(){a(this).garlic()})})}(window.jQuery||window.Zepto);