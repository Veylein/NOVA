const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); // For Wikipedia API: Ensure this dependency exists in package.json or install it

const app = express();
const PORT = 3001;

app.use(bodyParser.json());
app.use(express.static('public'));

const MEMORY_DIR = path.join(__dirname, 'data', 'knowledge');

// --- Helper Functions ---

function loadMemory() {
    let combinedMemory = {};
    
    // Ensure directory exists
    if (!fs.existsSync(MEMORY_DIR)){
        fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }

    const files = fs.readdirSync(MEMORY_DIR);

    files.forEach(file => {
        if (path.extname(file) === '.json') {
            try {
                const filePath = path.join(MEMORY_DIR, file);
                const data = fs.readFileSync(filePath, 'utf8');
                const json = JSON.parse(data);
                if (json) {
                    Object.assign(combinedMemory, json);
                }
            } catch (err) {
                console.error(`Error loading ${file}:`, err);
            }
        }
    });
    
    return combinedMemory;
}

function saveLearned(key, value) {
    const learnedPath = path.join(MEMORY_DIR, 'learned.json');
    let learned = {};
    
    try {
        if (fs.existsSync(learnedPath)) {
            const content = fs.readFileSync(learnedPath, 'utf8');
            if (content.trim()) {
                learned = JSON.parse(content);
            }
        }
    } catch (e) {
        console.error("Error reading learned.json", e);
        learned = {};
    }

    learned[key] = value;
    fs.writeFileSync(learnedPath, JSON.stringify(learned, null, 2));
}

function saveLearnedBatch(items) {
    const learnedPath = path.join(MEMORY_DIR, 'learned.json');
    let learned = {};
    
    try {
        if (fs.existsSync(learnedPath)) {
            const content = fs.readFileSync(learnedPath, 'utf8');
            if (content.trim()) {
                learned = JSON.parse(content);
            }
        }
    } catch (e) {
        console.error("Error reading learned.json for batch", e);
        learned = {};
    }

    // items array structure: [{ questions: ["..."], answer: "..." }]
    items.forEach(item => {
        const questions = item.questions || (item.question ? [item.question] : []);
        const answer = item.answer;

        if (answer && questions.length > 0) {
             questions.forEach(q => {
                 const key = q.toLowerCase().trim();
                 learned[key] = answer;
             });
        }
    });

    fs.writeFileSync(learnedPath, JSON.stringify(learned, null, 2));
}

function findBestMatch(input, memory) {
    if (!input) return null;
    const lowerInput = input.toLowerCase().trim();
    
    let bestMatchKey = null;
    let maxLen = 0;

    for (const key of Object.keys(memory)) {
        // Check if input contains the key (e.g. input "who is iron man", key "iron man")
        // Or if key contains input? Usually key is the trigger.
        // Let's stick to: if input includes key
        if (lowerInput.includes(key) && key.length > maxLen) {
            bestMatchKey = key;
            maxLen = key.length;
        }
    }

    if (bestMatchKey) {
        const result = memory[bestMatchKey];
        // If result is array (random response), pick one
        if (Array.isArray(result)) {
            return result[Math.floor(Math.random() * result.length)];
        }
        return result;
    }

    return null;
}

// --- Routes ---

app.post('/api/chat', async (req, res) => {
    const userMessage = req.body.message;
    if (!userMessage) return res.status(400).json({ error: 'No message provided' });

    // 1. Check Stats/Status commands
    if (userMessage.toLowerCase() === 'status' || userMessage.toLowerCase() === 'system status') {
        const mem = loadMemory();
        return res.json({ 
            reply: `System Online. Memory banks contain ${Object.keys(mem).length} facts. Processor temperature nominal.`,
            needsLearning: false
        });
    }

    let response = null;
    let memory = loadMemory();
    
    // 2. Try local memory
    response = findBestMatch(userMessage, memory);

    // 3. Fallback: Wikipedia
    if (!response) {
        if (userMessage.toLowerCase().startsWith('what is') || userMessage.toLowerCase().startsWith('who is')) {
            const topic = userMessage.replace(/what is|who is/gi, '').trim();
            if (topic.length > 0) {
                try {
                    // Using a simple fetch if node-fetch is available, otherwise this might fail if not installed.
                    // Assuming node-fetch is installed as per previous context.
                    const wikiRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`);
                    if (wikiRes.ok) {
                        const wikiData = await wikiRes.json();
                        if (wikiData.extract) {
                            response = `Searching database... Found in global archives: "${wikiData.extract.split('\n')[0]}"`;
                        }
                    }
                } catch (e) {
                    console.error("Wiki lookup failed", e);
                }
            }
        }
    }

    // 4. Default Unknown
    if (!response) {
        res.json({ 
            reply: "I do not have data on this subject. You may teach me by saying: 'Q: [question] A: [answer]'", 
            needsLearning: true 
        });
    } else {
        res.json({ 
            reply: response, 
            needsLearning: false 
        });
    }
});

app.post('/api/learn', (req, res) => {
    const { question, answer } = req.body;
    if (!question || !answer) return res.status(400).json({ error: 'Missing data' });
    const key = question.toLowerCase().trim();
    saveLearned(key, answer);
    res.json({ success: true, message: "Knowledge assimilated." });
});

app.post('/api/learn-batch', (req, res) => {
    const { items } = req.body; // Expects { items: [{ questions: [], answer: "" }] }
    if (!items || !Array.isArray(items)) return res.status(400).json({ error: 'Invalid batch format' });

    saveLearnedBatch(items);
    
    res.json({ success: true, message: `Batch processing complete. Assimilated ${items.length} new data points.` });
});

app.get('/api/stats', (req, res) => {
    const memory = loadMemory();
    const count = Object.keys(memory).length;
    res.json({ 
        totalFacts: count, 
        status: 'Online' 
    });
});

app.listen(PORT, () => {
    console.log(`NOVA Interface running at http://localhost:${PORT}`);
});
