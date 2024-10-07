const ELASTICSEARCH_URL = 'http://localhost:9200/acled_events/_search'; // Replace with your index name

let activeEventTypes = new Set(["Battles"]); // Set initial active event to "Battles"
let isBrushingEnabled = false; // Track if brushing is enabled
let brush; // Declare brush globally
let brushGroup; // Store brush group for toggling
let spikesGroup; // Reference to the spikes group
let zoom; // Store the zoom behavior for toggling
let zoomGroup; // Reference to zoom group for toggling

async function fetchAllDataFromElasticsearch() {
    let allResults = [];
    let scrollId;
    const size = 10000;

    try {
        let response = await fetch(`${ELASTICSEARCH_URL}?scroll=1m`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                _source: [
                    "event_id_cnty",
                    "event_date",
                    "year",
                    "time_precision",
                    "disorder_type",
                    "event_type",
                    "notes",
                    "fatalities",
                    "latitude",
                    "longitude",
                    "geo_precision",
                    "location_point"
                ],
                query: {
                    match_all: {}
                },
                size: size
            })
        });

        if (!response.ok) {
            const errorResponse = await response.json();
            console.error('Elasticsearch error response:', errorResponse);
            throw new Error(`Failed to fetch data: ${response.statusText}`);
        }

        let data = await response.json();
        allResults = data.hits.hits.map(hit => transformData(hit));
        scrollId = data._scroll_id;

        while (data.hits.hits.length > 0) {
            response = await fetch('http://localhost:9200/_search/scroll', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    scroll: '1m',
                    scroll_id: scrollId
                })
            });

            if (!response.ok) {
                const errorResponse = await response.json();
                console.error('Elasticsearch error response:', errorResponse);
                throw new Error(`Failed to fetch data: ${response.statusText}`);
            }

            data = await response.json();
            scrollId = data._scroll_id;
            allResults = allResults.concat(data.hits.hits.map(hit => transformData(hit)));

            if (allResults.length >= 200000) {
                console.warn('Reached limit of 200,000 documents; stopping further fetches.');
                break;
            }
        }

        await fetch('http://localhost:9200/_search/scroll', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ scroll_id: scrollId })
        });

        return allResults;
    } catch (error) {
        console.error('Error fetching data from Elasticsearch:', error);
        return [];
    }
}

function transformData(hit) {
    return {
        event_id_cnty: hit._source.event_id_cnty,
        event_date: hit._source.event_date,
        year: hit._source.year,
        time_precision: hit._source.time_precision,
        disorder_type: hit._source.disorder_type,
        event_type: hit._source.event_type,
        notes: hit._source.notes,
        fatalities: hit._source.fatalities,
        latitude: hit._source.latitude,
        longitude: hit._source.longitude,
        geo_precision: hit._source.geo_precision,
        location_point: hit._source.location_point
    };
}

export function createSpikeMap(geojson, eventsData) {
    const width = 975;
    const height = 610;

    const svg = d3.create("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [0, 0, width, height])
        .attr("style", "width: 100%; height: auto;");

    const projection = d3.geoMercator().fitSize([width, height], geojson);
    const path = d3.geoPath().projection(projection);
    zoomGroup = svg.append("g");

    // Draw the map boundaries
    zoomGroup.append("path")
        .datum(geojson)
        .attr("d", path)
        .attr("fill", "#1C1C1C") // Set the map color to greyish black
        .attr("stroke", "#fff");

    const lengthScale = d3.scaleLinear()
        .domain([0, d3.max(eventsData, d => d.fatalities)])
        .range([0, 50]);

    const eventTypes = Array.from(new Set(eventsData.map(d => d.event_type)));
    const colorScale = d3.scaleSequential()
        .domain([eventTypes.length - 1, 0]) // Reverse the domain for color inversion
        .interpolator(d3.interpolateTurbo);

    spikesGroup = zoomGroup.append("g")
        .attr("class", "spikes")
        .attr("fill-opacity", 0.5)
        .attr("stroke-width", 0.5);

    spikesGroup.selectAll("path")
        .data(eventsData)
        .join("path")
        .attr("transform", d => {
            const [x, y] = projection([d.longitude, d.latitude]);
            return `translate(${x},${y})`;
        })
        .attr("d", d => spike(lengthScale(d.fatalities)))
        .attr("fill", d => colorScale(eventTypes.indexOf(d.event_type)))
        .attr("stroke", d => colorScale(eventTypes.indexOf(d.event_type)))
        .attr("display", d => activeEventTypes.has(d.event_type) ? "block" : "none") // Show only "Battles" initially
        .append("title")
        .text(d => `${d.event_type}: ${d.fatalities}`);

    // Brushing functionality
    brush = d3.brush()
        .extent([[0, 0], [width, height]])
        .on("start", (event) => {
            if (!event.sourceEvent || event.sourceEvent.type !== 'wheel') {
                svg.on('.zoom', null); // Disable zooming if not using the scroll wheel
            }
        })
        .on("end", brushed);

    brushGroup = svg.append("g")
        .attr("class", "brush")
        .style("display", "none"); // Initially hide the brush

    // Add zoom behavior
    zoom = d3.zoom()
        .scaleExtent([1, 8])
        .filter((event) => {
            // Allow zoom only on scroll, ignore other events
            return event.type === 'wheel' || !isBrushingEnabled;
        })
        .on("zoom", (event) => {
            zoomGroup.attr("transform", event.transform);
        });

    svg.call(zoom);

    // Add legend with toggle buttons
    const legend = svg.append("g")
        .attr("class", "legend")
        .attr("transform", "translate(20, 20)");

    legend.selectAll("rect")
        .data(eventTypes)
        .join("rect")
        .attr("x", 0)
        .attr("y", (d, i) => i * 25)
        .attr("width", 20)
        .attr("height", 20)
        .attr("fill", (d, i) => colorScale(i))
        .attr("stroke", "#000")
        .style("cursor", "pointer")
        .on("click", (event, d) => {
            if (activeEventTypes.has(d)) {
                activeEventTypes.delete(d);
            } else {
                activeEventTypes.add(d);
            }
            updateSpikes();
        });

    legend.selectAll("text")
        .data(eventTypes)
        .join("text")
        .attr("x", 30)
        .attr("y", (d, i) => i * 25 + 15)
        .text(d => d)
        .style("cursor", "pointer")
        .on("click", (event, d) => {
            if (activeEventTypes.has(d)) {
                activeEventTypes.delete(d);
            } else {
                activeEventTypes.add(d);
            }
            updateSpikes();
        });

    // Toggle brush button
    document.getElementById('toggle-brush').addEventListener('click', () => {
        isBrushingEnabled = !isBrushingEnabled;
        if (isBrushingEnabled) {
            brushGroup.style('display', 'block'); // Show the brush group
            brushGroup.call(brush);
        } else {
            brushGroup.call(brush.move, null); // Clear any existing selection
            brushGroup.on('.brush', null); // Remove brush event listeners
            brushGroup.style('display', 'none'); // Hide the brush group
            svg.call(zoom); // Re-enable zooming
        }
    });

    // Clear selection button
    document.getElementById('clear-selection').addEventListener('click', () => {
        brushGroup.call(brush.move, null);
        spikesGroup.selectAll("path").attr("fill-opacity", 0.5); // Reset spike opacity
    });

    function brushed(event) {
        if (!event.selection) {
            svg.call(zoom); // Re-enable zooming if no brush selection was made
            return;
        }

        const [[x0, y0], [x1, y1]] = event.selection;

        spikesGroup.selectAll("path")
            .attr("fill-opacity", d => {
                const [x, y] = projection([d.longitude, d.latitude]);
                const selected = x >= x0 && x <= x1 && y >= y0 && y <= y1;
                return selected ? 0.9 : 0.1;
            });

        svg.call(zoom); // Re-enable zooming after brushing
    }

    function updateSpikes() {
        spikesGroup.selectAll("path")
            .attr("display", d => activeEventTypes.has(d.event_type) ? "block" : "none")
            .attr("fill-opacity", 0.5);
    }

    function spike(length) {
        return `M0,0L2,${length}L-2,${length}Z`;
    }

    return svg.node();
}

export async function initMap() {
    try {
        const [geojson, eventsData] = await Promise.all([
            d3.json('ukraine-boundary.geojson'),
            fetchAllDataFromElasticsearch()
        ]);

        const svg = createSpikeMap(geojson, eventsData);
        document.getElementById('map-container').appendChild(svg);
    } catch (error) {
        console.error('Error initializing the map:', error);
    }
}
