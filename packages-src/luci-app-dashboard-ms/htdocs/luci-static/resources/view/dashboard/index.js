'use strict';
'require view';
'require dom';
'require fs';

document.querySelector('head').appendChild(E('link', {
    'rel': 'stylesheet',
    'type': 'text/css',
    'href': L.resource('view/dashboard/css/custom.css') + '?v=' + Math.random()
}));

function invokeIncludesLoad(includes) {
    var tasks = [];
    var has_load = false;
    for (var i = 0; i < includes.length; i++) {
        if (typeof(includes[i].load) == 'function') {
            tasks.push(includes[i].load().catch(L.bind(function() { this.failed = true; }, includes[i])));
            has_load = true;
        } else {
            tasks.push(null);
        }
    }
    return has_load ? Promise.all(tasks) : Promise.resolve(null);
}

return view.extend({
    load: function() {
        return L.resolveDefault(fs.list('/www' + L.resource('view/dashboard/include')), []).then(function(entries) {
            return Promise.all(entries.filter(function(e) {
                return (e.type == 'file' && e.name.match(/\.js$/));
            }).map(function(e) {
                return 'view.dashboard.include.' + e.name.replace(/\.js$/, '');
            }).sort().map(function(n) {
                return L.require(n);
            }));
        });
    },

    render: function(includes) {
        var rv = E([]);
        var containers = [];

        rv.appendChild(E('div', { 'id': 'dashboard-active-marker', 'style': 'display:none' }));

        for (var i = 0; i < includes.length - 1; i++) {
            var container = E('div', { 'class': 'section-content' });
            rv.appendChild(E('div', { 'class': 'cbi-section-' + i, 'style': 'display:none' }, [container]));
            containers.push(container);
        }

        return invokeIncludesLoad(includes).then(function(results) {
            for (var i = 0; i < includes.length; i++) {
                var content = null;
                if (includes[i].failed) continue;
                if (typeof(includes[i].render) == 'function')
                    content = includes[i].render(results ? results[i] : null);
                else if (includes[i].content != null)
                    content = includes[i].content;
                if (content != null) {
                    if (i > 1) {
                        dom.append(containers[1], content);
                    } else {
                        containers[i].parentNode.style.display = '';
                        containers[i].parentNode.classList.add('fade-in');
                        containers[i].parentNode.classList.add('Dashboard');
                        dom.content(containers[i], content);
                    }
                }
            }

            requestAnimationFrame(function() {
                for (var j = 0; j < includes.length; j++) {
                    if (!includes[j].failed && typeof(includes[j].startPolling) == 'function') {
                        includes[j].startPolling();
                    }
                }
            });

            var ssi = document.querySelector('div.includes');
            if (ssi) { ssi.style.display = ''; ssi.classList.add('fade-in'); }

            return rv;
        });
    },

    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});