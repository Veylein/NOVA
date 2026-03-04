const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); // For Wikipedia API

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
                // Merge into one big object for searching
                Object.assign(combinedMemory, json);
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
            learned = JSON.parse(fs.readFileSync(learnedPath, 'utf8'));
        }
    } catch (e) {
        learned = {};
    }

    learned[key] = value;
    fs.writeFileSync(learnedPath, JSON.stringify(learned, null, 2));
}

function findBestMatch(input, memory) {
    const lowerInput = input.toLowerCase();
    
    // We try to find the longest key that exists in the input
    let bestMatchKey = null;
    let maxLen = 0;

    for (const key of Object.keys(memory)) {
        if (lowerInput.includes(key) && key.length > maxLen) {
            bestMatchKey = key;
            maxLen = key.length;
        }
    }

    if (bestMatchKey) {
        return memory[bestMatchKey];
    }

    return null;
}

// --- Routes ---

app.get('/api/chat', async (req, res) => {
    const userMessage = req.query.q;
    if (!userMessage) return res.status(400).json({ error: 'No message provided' });

    let memory = loadMemory();
    
    // 1. Try local memory
    let response = findBestMatch(userMessage, memory);

    // 2. If no local memory, try Wikipedia (simulating "searching")
    if (!response) {
        if (userMessage.toLowerCase().startsWith('what is') || userMessage.toLowerCase().startsWith('who is')) {
            const topic = userMessage.replace(/what is|who is/gi, '').trim();
            if (topic.length > 0) {
                try {
                    const wikiRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`);
                    if (wikiRes.ok) {
                        const wikiData = await wikiRes.json();
                        if (wikiData.extract) {
                            response = `I didn't know that, but I looked on Wikipedia! It says: "${wikiData.extract.split('.')[0]}." (That's a big word!)`;
                        }
                    }
                } catch (e) {
                    console.error("Wiki error", e);
                }
            }
        }
    }

    // 3. Fallback: Ask to learn
    if (!response) {
        res.json({ 
            answer: "I don't know that yet! Tell me what I should say so I can remember it.", 
            needsLearning: true 
        });
    } else {
        res.json({ answer: response, needsLearning: false });
    }
});

app.post('/api/learn', (req, res) => {
    const { question, answer } = req.body;
    if (!question || !answer) return res.status(400).json({ error: 'Missing data' });

    // Normalize key
    const key = question.toLowerCase().trim();
    
    // Save to learned.json
    saveLearned(key, answer);
    
    res.json({ success: true, message: "Yay! I learned something new!" });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
