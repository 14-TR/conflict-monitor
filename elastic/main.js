// Elasticsearch endpoint (modify this to your setup)
const ELASTICSEARCH_URL = 'http://localhost:9200/acled_events/_search';

// Function to fetch data from Elasticsearch based on date range
async function fetchData(startDate, endDate) {
    const query = {
        query: {
            bool: {
                filter: [
                    {
                        range: {
                            event_date: {
                                gte: startDate,
                                lte: endDate
                            }
                        }
                    }
                ]
            }
        },
        size: 1000 // Adjust the size according to the expected data volume
    };

    try {
        const response = await fetch(ELASTICSEARCH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(query)
        });

        if (!response.ok) {
            throw new Error(`Error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.hits.hits.map(hit => hit._source); // Extract and return the source data
    } catch (error) {
        console.error('Error fetching data from Elasticsearch:', error);
        return [];
    }
}

// Function to render a basic chart with D3.js
function renderChart(data) {
    const container = d3.select('#chart-container');
    container.selectAll('*').remove(); // Clear previous content

    // Set up chart dimensions
    const width = 800;
    const height = 400;
    
    const svg = container.append('svg')
        .attr('width', width)
        .attr('height', height);
    
    // Example: Render circles for each event (you can customize this based on your needs)
    svg.selectAll('circle')
        .data(data)
        .enter()
        .append('circle')
        .attr('cx', (d, i) => i * 5)  // Simple x positioning (customize as needed)
        .attr('cy', height / 2)       // Center vertically
        .attr('r', 3)
        .attr('fill', 'steelblue');
}

// Event listener for the "Fetch Data" button
document.getElementById('fetch-data').addEventListener('click', async () => {
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;

    if (!startDate || !endDate) {
        alert('Please select both start and end dates.');
        return;
    }

    const data = await fetchData(startDate, endDate);
    renderChart(data); // Render the chart using D3.js
});
