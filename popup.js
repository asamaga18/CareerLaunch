const defaultBlockedHosts = [
	"facebook.com",
	"twitter.com",
	"instagram.com",
	"youtube.com",
	"tiktok.com"
];

// Mutable teaser list so we can replace with CSV-loaded data
let brainTeasers = [
	{ question: "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?", answer: "An echo" },
	{ question: "What has keys but no locks, space but no room, and you can enter but can't go inside?", answer: "A keyboard" },
	{ question: "The more you take, the more you leave behind. What am I?", answer: "Footsteps" },
	{ question: "What can travel around the world while staying in a corner?", answer: "A stamp" },
	{ question: "I'm light as a feather, yet the strongest person can't hold me for five minutes. What am I?", answer: "Your breath" },
	{ question: "What has a head and a tail but no body?", answer: "A coin" },
	{ question: "What gets wetter the more it dries?", answer: "A towel" },
	{ question: "What can you catch but not throw?", answer: "A cold" },
	{ question: "I have cities, but no houses. I have mountains, but no trees. I have water, but no fish. What am I?", answer: "A map" },
	{ question: "What goes up but never comes down?", answer: "Your age" },
	{ question: "What has many teeth but can't bite?", answer: "A comb" },
	{ question: "What begins with T, ends with T, and has T in it?", answer: "A teapot" },
	{ question: "What comes once in a minute, twice in a moment, but never in a thousand years?", answer: "The letter M" },
	{ question: "If you drop me, I'm sure to crack, but smile at me and I'll smile back. What am I?", answer: "A mirror" },
	{ question: "I have branches, but no fruit, trunk, or leaves. What am I?", answer: "A bank" }
];

// Basic CSV splitter for a single line: handles quoted fields and escaped quotes
function splitCSVLine(line) {
	const cells = [];
	let current = "";
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (inQuotes) {
			if (ch === '"') {
				if (line[i + 1] === '"') {
					current += '"';
					i++; // skip escaped quote
				} else {
					inQuotes = false;
				}
			} else {
				current += ch;
			}
		} else {
			if (ch === '"') {
				inQuotes = true;
			} else if (ch === ',') {
				cells.push(current);
				current = "";
			} else {
				current += ch;
			}
		}
	}
	cells.push(current);
	return cells.map((c) => c.trim());
}

async function loadRiddlesFromCSV() {
	try {
		const url = chrome?.runtime?.getURL ? chrome.runtime.getURL("riddles.csv") : "riddles.csv";
		const res = await fetch(url);
		if (!res.ok) throw new Error(`Failed to load riddles.csv: ${res.status}`);
		const text = await res.text();
		const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
		if (!lines.length) return;
		// Header: QUESTIONS,ANSWERS
		const header = splitCSVLine(lines[0]);
		const qIdx = header.findIndex((h) => /question/i.test(h));
		const aIdx = header.findIndex((h) => /answer/i.test(h));
		if (qIdx === -1 || aIdx === -1) return;
		const parsed = [];
		for (let i = 1; i < lines.length; i++) {
			const parts = splitCSVLine(lines[i]);
			const question = parts[qIdx] ?? "";
			const answer = parts[aIdx] ?? "";
			if (question && answer) {
				parsed.push({ question, answer });
			}
		}
		if (parsed.length) {
			brainTeasers = parsed;
		}
	} catch (e) {
		// If loading fails, keep fallback brainTeasers
		console.warn("Riddle CSV load failed; using fallback teasers.", e);
	}
}

function toLines(hosts) {
	return hosts.join("\n");
}

function parseTextarea(value) {
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

function setStatus(text) {
	const status = document.getElementById("blocked-status");
	status.textContent = text;
}

let currentTeaser = null;

function getRandomTeaser() {
	return brainTeasers[Math.floor(Math.random() * brainTeasers.length)];
}

function displayTeaser() {
	const questionElement = document.getElementById("brain-teaser-question");
	const answerElement = document.getElementById("brain-teaser-answer");
	const revealBtn = document.getElementById("reveal-answer-btn");
	if (questionElement && answerElement && revealBtn) {
		currentTeaser = getRandomTeaser();
		questionElement.textContent = currentTeaser.question;
		answerElement.textContent = "";
		answerElement.hidden = true;
		revealBtn.textContent = "Reveal Answer";
	}
}

function toggleAnswer() {
	const answerElement = document.getElementById("brain-teaser-answer");
	const revealBtn = document.getElementById("reveal-answer-btn");
	if (answerElement && currentTeaser && revealBtn) {
		if (answerElement.hidden) {
			answerElement.textContent = `Answer: ${currentTeaser.answer}`;
			answerElement.hidden = false;
			revealBtn.textContent = "Hide Answer";
		} else {
			answerElement.hidden = true;
			revealBtn.textContent = "Reveal Answer";
		}
	}
}

document.addEventListener("DOMContentLoaded", async () => {
	const toggle = document.getElementById("blocked-toggle");
	const panel = document.getElementById("blocked-panel");
	const textarea = document.getElementById("blocked-list");
	const save = document.getElementById("blocked-save");
	const nextTeaserBtn = document.getElementById("next-teaser-btn");
	const revealAnswerBtn = document.getElementById("reveal-answer-btn");
	
	// Load CSV riddles, then display initial teaser
	await loadRiddlesFromCSV();
	displayTeaser();

	chrome.storage.sync.get({ blockedHosts: defaultBlockedHosts }, ({ blockedHosts }) => {
		const hosts = Array.isArray(blockedHosts) ? blockedHosts : defaultBlockedHosts;
		textarea.value = toLines(hosts);
	});

	toggle.addEventListener("click", () => {
		panel.hidden = !panel.hidden;
		setStatus("");
	});

	save.addEventListener("click", () => {
		const hosts = parseTextarea(textarea.value);
		chrome.runtime.sendMessage({ type: "saveBlockedHosts", hosts }, (response) => {
			if (chrome.runtime.lastError) {
				setStatus("Save failed. Try again.");
				return;
			}
			if (response?.ok) {
				setStatus("Saved.");
				return;
			}
			setStatus("Save failed. Try again.");
		});
	});
	
	// Next teaser button handler
	if (nextTeaserBtn) {
		nextTeaserBtn.addEventListener("click", displayTeaser);
	}
	
	// Reveal/hide answer button handler
	if (revealAnswerBtn) {
		revealAnswerBtn.addEventListener("click", toggleAnswer);
	}
});
