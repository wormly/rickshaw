Rickshaw.namespace('Rickshaw.Graph.HoverDetail');

Rickshaw.Graph.HoverDetail = Rickshaw.Class.create({

	initialize: function(args) {

		var graph = this.graph = args.graph;

		this.xFormatter = args.xFormatter || function(x) {
			return new Date( x * 1000 ).toUTCString();
		};

		this.yFormatter = args.yFormatter || function(y) {
			return y === null ? y : y.toFixed(2);
		};

		var element = this.element = document.createElement('div');
		element.className = 'detail';

		this.visible = true;
		graph.element.appendChild(element);

		this.lastEvent = null;
		this._addListeners();

		this.onShow = args.onShow;
		this.onHide = args.onHide;
		this.onRender = args.onRender;

		this.formatter = args.formatter || this.formatter;

	},

	formatter: function(series, x, y, formattedX, formattedY, d) {
		return series.name + ':&nbsp;' + formattedY;
	},

	enable: function() {
		this._addListeners();
	},

	disable: function() {
		this._removeListeners();
	},

	update: function(e) {

		e = e || this.lastEvent;
		if (!e) return;
		this.lastEvent = e;

		if (!e.target.nodeName.match(/^(path|svg|rect|circle)$/)) return;

		var graph = this.graph;

		var eventX = e.offsetX || e.layerX;
		var eventY = e.offsetY || e.layerY;

		var j = 0;
		var points = [];
		var nearestPoint;

		this.graph.series.active().forEach( function(series) {

			var data = this.graph.stackedData[j++];

			if (!data.length)
				return;

			var domainX = graph.x.invert(eventX);

			var domainIndexScale = d3.scale.linear()
				.domain([data[0].x, data.slice(-1)[0].x])
				.range([0, data.length - 1]);

			var approximateIndex = Math.round(domainIndexScale(domainX));
			if (approximateIndex == data.length - 1) approximateIndex--;

			var dataIndex = Math.min(approximateIndex || 0, data.length - 1);

			for (var i = approximateIndex; i < data.length - 1;) {

				if (!data[i] || !data[i + 1]) break;

				if (data[i].x <= domainX && data[i + 1].x > domainX) {
					dataIndex = Math.abs(domainX - data[i].x) < Math.abs(domainX - data[i + 1].x) ? i : i + 1;
					break;
				}

				if (data[i + 1].x <= domainX) { i++ } else { i-- }
			}

			if (dataIndex < 0) dataIndex = 0;
			var value = data[dataIndex];

			var distance = Math.sqrt(
				Math.pow(Math.abs(graph.x(value.x) - eventX), 2) +
				Math.pow(Math.abs(graph.y(value.y + value.y0) - eventY), 2)
			);

			var xFormatter = series.xFormatter || this.xFormatter;
			var yFormatter = series.yFormatter || this.yFormatter;

			var point = {
				formattedXValue: xFormatter(value.x),
				formattedYValue: yFormatter(series.scale ? series.scale.invert(value.y) : value.y),
				series: series,
				value: value,
				distance: distance,
				order: j,
				name: series.name
			};

			if (!nearestPoint || distance < nearestPoint.distance) {
				nearestPoint = point;
			}

			points.push(point);

		}, this );

		if (!nearestPoint)
			return;

		nearestPoint.active = true;

		var domainX = nearestPoint.value.x;
		var formattedXValue = nearestPoint.formattedXValue;

		this.element.innerHTML = '';
		this.element.style.left = graph.x(domainX) + 'px';

		this.visible && this.render( {
			points: points,
			detail: points, // for backwards compatibility
			mouseX: eventX,
			mouseY: eventY,
			formattedXValue: formattedXValue,
			domainX: domainX
		} );
	},

	hide: function() {
		this.visible = false;
		this.element.classList.add('inactive');

		if (typeof this.onHide == 'function') {
			this.onHide();
		}
	},

	show: function() {
		this.visible = true;
		this.element.classList.remove('inactive');

		if (typeof this.onShow == 'function') {
			this.onShow();
		}
	},

	render: function(args) {

		var graph = this.graph;
		var points = args.points;
		var point = points.filter( function(p) { return p.active } ).shift();

		if (point.value.y === null) return;

		var formattedXValue = point.formattedXValue;
		var formattedYValue = point.formattedYValue;

		this.element.innerHTML = '';
		this.element.style.left = graph.x(point.value.x) + 'px';

		var xLabel = document.createElement('div');

		xLabel.className = 'x_label';
		xLabel.innerHTML = formattedXValue;
		this.element.appendChild(xLabel);

		var item = document.createElement('div');

		item.className = 'item';

		// invert the scale if this series displays using a scale
		var series = point.series;
		var actualY = series.scale ? series.scale.invert(point.value.y) : point.value.y;

		item.innerHTML = this.formatter(series, point.value.x, actualY, formattedXValue, formattedYValue, point);

		var minimumTopOffsetForYAxisLabel = xLabel.clientHeight * 1.5
		var yAxisPosition = Math.max(this.graph.y(point.value.y0 + point.value.y), 0);
		item.style.top = yAxisPosition + 'px';

		if (yAxisPosition < minimumTopOffsetForYAxisLabel) {
			// Reposition below the floating y-axis label:
			xLabel.style.top = (yAxisPosition + 13) + "px";
			xLabel.style.opacity = 0.7;
		} else {
			// Leave it at the top of the graph (as per default)
			xLabel.style.top = "";
			xLabel.style.opacity = 1;
		}

		this.element.appendChild(item);

		var dot = document.createElement('div');

		dot.className = 'dot';
		dot.style.top = item.style.top;
		dot.style.borderColor = series.color;

		this.element.appendChild(dot);

		if (point.active) {
			item.classList.add('active');
			dot.classList.add('active');
		}

		// Assume left alignment until the element has been displayed and
		// bounding box calculations are possible.
		var alignables = [xLabel, item];
		alignables.forEach(function(el) {
			el.classList.add('left');
		});

		this.show();

		// If left-alignment results in any error, try right-alignment.
		var leftAlignError = this._calcLayoutError(alignables);
		if (leftAlignError > 0) {
			alignables.forEach(function(el) {
				el.classList.remove('left');
				el.classList.add('right');
			});

			// If right-alignment is worse than left alignment, switch back.
			var rightAlignError = this._calcLayoutError(alignables);
			if (rightAlignError > leftAlignError) {
				alignables.forEach(function(el) {
					el.classList.remove('right');
					el.classList.add('left');
				});
			}
		}

		if (typeof this.onRender == 'function') {
			this.onRender(args);
		}
	},

	_calcLayoutError: function(alignables) {
		// Layout error is calculated as the number of linear pixels by which
		// an alignable extends past the left or right edge of the parent.
		var parentRect = this.element.parentNode.getBoundingClientRect();

		var error = 0;
		var alignRight = alignables.forEach(function(el) {
			var rect = el.getBoundingClientRect();
			if (!rect.width) {
				return;
			}

			if (rect.right > parentRect.right) {
				error += rect.right - parentRect.right;
			}

			if (rect.left < parentRect.left) {
				error += parentRect.left - rect.left;
			}
		});
		return error;
	},

	_addListeners: function() {
		if (this.listenerMousemove !== undefined) return;

		this.listenerMousemove = function(e) {
			this.visible = true;
			this.update(e);
		}.bind(this);

		this.graph.element.addEventListener(
			'mousemove',
			this.listenerMousemove,
			false
		);

		var graphElementRect = this.graph.element.getBoundingClientRect();

		this.listenerTouchmove = function (event) {
			this.visible = true;
			var touch = event.touches[0] || event.changedTouches[0]
			// Create a faux "mousemove-like event" for use in update() above:
			// Need to do this since touch events don't include offsetX/Y co-ords.
			var newEvent = {
				offsetX: touch.pageX - graphElementRect.left - window.pageXOffset,
				offsetY: touch.pageY - graphElementRect.top - window.pageYOffset,
				target: event.target
			}
			this.update(newEvent);
		}.bind(this),

		this.graph.element.addEventListener(
			'touchmove',
			this.listenerTouchmove,
			false
		);

		this.graph.onUpdate( function() { this.update() }.bind(this) );

		this.listenerMouseout = function(e) {
			if (e.relatedTarget && !(e.relatedTarget.compareDocumentPosition(this.graph.element) & Node.DOCUMENT_POSITION_CONTAINS)) {
				this.hide();
			}
		}.bind(this),

		this.graph.element.addEventListener(
			'mouseout',
			this.listenerMouseout,
			false
		);
	},

	_removeListeners: function() {
		if (this.listenerMousemove == undefined) return;

		this.graph.element.removeEventListener(
			'mousemove',
			this.listenerMousemove
		);

		delete this.listenerMousemove

		this.graph.element.removeEventListener(
			'touchmove',
			this.listenerTouchmove
		);

		delete this.listenerTouchmove

		this.graph.element.removeEventListener(
			'mouseout',
			this.listenerMouseout
		);

		delete this.listenerMouseout
	}
});
