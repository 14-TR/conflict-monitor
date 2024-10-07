const FLASK_SERVER_URL = 'http://localhost:5000/query_data'; // Flask server URL

let activeEventTypes = new Set(["Battles"]); // Set initial active event to "Battles"
let isBrushingEnabled = false; // Track if brushing is enabled
let brush; // Declare brush globally
let brushGroup; // Store brush group for toggling
let spikesGroup; // Reference to the spikes group
let zoom; // Store the zoom behavior for toggling
let zoomGroup; // Reference to zoom group for toggling

function updateSpikes() {
    spikesGroup.selectAll("path")
        .attr("display", d => activeEventTypes.has(d.event_type) ? "block" : "none")
        .attr("fill-opacity", 0.5);
}


// Function to fetch data from Flask server (DuckDB)
export async function fetchDataFromDuckDB(eventType = null, startDate = null, endDate = null) {
    try {
        let url = `${FLASK_SERVER_URL}?`;
        if (eventType) {
            url += `event_type=${eventType}&`;
        }
        if (startDate && endDate) {
            url += `start_date=${startDate}&end_date=${endDate}`;
        }

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch data: ${response.statusText}`);
        }

        const data = await response.json();
        return data.map(d => ({
            event_id_cnty: d.event_id_cnty,
            event_date: d.event_date,
            year: d.year,
            time_precision: d.time_precision,
            disorder_type: d.disorder_type,
            event_type: d.event_type,
            notes: d.notes,
            fatalities: d.fatalities,
            latitude: d.latitude,
            longitude: d.longitude,
            geo_precision: d.geo_precision,
            location_point: d.location_point
        }));
    } catch (error) {
        console.error('Error fetching data from Flask server:', error);
        return [];
    }
}

// Function to create the spike map
export function createSpikeMap(geojson, eventsData) {
    const width = 975;
    const height = 610;

    // Create an SVG container
    const svg = d3.create("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [0, 0, width, height])
        .attr("style", "width: 100%; height: auto;");

    // Define projection and path
    const projection = d3.geoMercator().fitSize([width, height], geojson);
    const path = d3.geoPath().projection(projection);
    zoomGroup = svg.append("g");

    // Draw the geographic shapes (Ukraine's boundaries)
    zoomGroup.append("path")
        .datum(geojson)
        .attr("d", path)
        .attr("fill", "#1C1C1C") // Set the map color to greyish black
        .attr("stroke", "#fff");

    // Define scales for spike length and color
    const lengthScale = d3.scaleLinear()
        .domain([0, d3.max(eventsData, d => d.fatalities)])
        .range([0, 50]);

    const eventTypes = Array.from(new Set(eventsData.map(d => d.event_type)));
    const colorScale = d3.scaleSequential()
        .domain([eventTypes.length - 1, 0])
        .interpolator(d3.interpolateTurbo);

    // Draw spikes
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
        .attr("display", d => activeEventTypes.has(d.event_type) ? "block" : "none")
        .append("title")
        .text(d => `${d.event_type}: ${d.fatalities}`);

    // Initialize brushing
    brush = d3.brush()
        .extent([[0, 0], [width, height]])
        .on("end", brushed);

    brushGroup = svg.append("g")
        .attr("class", "brush");

    // Initialize zoom
    zoom = d3.zoom()
        .scaleExtent([1, 8])
        .on("zoom", (event) => {
            zoomGroup.attr("transform", event.transform);
        });

    svg.call(zoom); // Apply zoom to SVG

    // Brushing functionality
    function brushed(event) {
        if (!event.selection) {
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


    function spike(length) {
        return `M0,0L2,${length}L-2,${length}Z`;
    }

    return svg.node();
}

// Function to toggle brushing
export function toggleBrushing() {
    isBrushingEnabled = !isBrushingEnabled;
    if (isBrushingEnabled) {
        brushGroup.call(brush);
    } else {
        brushGroup.call(brush.move, null); // Clear existing brush selection
        brushGroup.on('.brush', null); // Disable brushing
        spikesGroup.selectAll("path").attr("fill-opacity", 0.5); // Reset spikes
    }
}

// Function to update spikes on the map
export function updateMap(eventTypes) {
    activeEventTypes = eventTypes;
    updateSpikes();
}

// Function to initialize the map
export async function initMap() {
    try {
        const [geojson, eventsData] = await Promise.all([
            d3.json('ukraine-boundary.geojson'),
            fetchDataFromDuckDB("Battles") // Fetch initial data for "Battles"
        ]);

        const svg = createSpikeMap(geojson, eventsData);
        document.getElementById('map-container').appendChild(svg);
    } catch (error) {
        console.error('Error initializing the map:', error);
    }
}
