        // State
        let examData = null;
        let currentQuestion = 0;
        let answers = {};
        let flaggedQuestions = new Set();
        let examStarted = false;
        let examFinished = false;
        let examMode = 'exam';
        let startTime = null;
        let timerInterval = null;
        let reviewFilter = 'all';
        let selectedDomains = new Set();
        let allDomains = [];
        let practiceRevealedQuestions = new Set();

        function generateRandomAlphanumericId(length = 14) {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let id = '';
            for (let i = 0; i < length; i++) {
                id += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return id;
        }

        function randomizeQuestionIds() {
            const usedIds = new Set();
            EXAM_DATA.allQuestions.forEach(question => {
                let randomId = generateRandomAlphanumericId(14);
                while (usedIds.has(randomId)) {
                    randomId = generateRandomAlphanumericId(14);
                }
                question.id = randomId;
                usedIds.add(randomId);
            });
        }

        // Get all unique domains from questions
        function getAllDomains() {
            const domains = {};
            EXAM_DATA.allQuestions.forEach(q => {
                const domain = q.domain || 'Uncategorized';
                if (!domains[domain]) {
                    domains[domain] = 0;
                }
                domains[domain]++;
            });
            return Object.entries(domains).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
        }

        // Get available questions count based on selected domains
        function getAvailableQuestionsCount() {
            if (selectedDomains.size === 0) return 0;
            return EXAM_DATA.allQuestions.filter(q => {
                const domain = q.domain || 'Uncategorized';
                return selectedDomains.has(domain);
            }).length;
        }

        // Shuffle array
        function shuffleArray(array) {
            const shuffled = [...array];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled;
        }

        // Select random questions based on selected domains
        function selectRandomQuestions() {
            // Filter by selected domains
            const filtered = EXAM_DATA.allQuestions.filter(q => {
                const domain = q.domain || 'Uncategorized';
                return selectedDomains.has(domain);
            });
            
            const shuffled = shuffleArray(filtered);
            const count = Math.min(EXAM_DATA.questionsPerExam || 60, shuffled.length);
            return shuffled.slice(0, count);
        }

        // Load questions
        function loadQuestions() {
            if (typeof EXAM_DATA !== 'undefined') {
                randomizeQuestionIds();
                // Initialize domains
                allDomains = getAllDomains();
                // Select all domains by default
                allDomains.forEach(d => selectedDomains.add(d.name));
                
                examData = {
                    title: EXAM_DATA.title,
                    description: EXAM_DATA.description,
                    passingScore: EXAM_DATA.passingScore,
                    totalQuestionsInPool: EXAM_DATA.allQuestions.length,
                    questionsPerExam: EXAM_DATA.questionsPerExam || 60,
                    questions: [] // Will be selected when exam starts
                };
                render();
            } else {
                document.getElementById('app').innerHTML = `
                    <div class="start-screen">
                        <div class="start-card">
                            <div class="start-logo">⚠️</div>
                            <h2 class="start-title">Error Loading Exam</h2>
                            <p class="start-subtitle">Could not load exam questions.</p>
                        </div>
                    </div>
                `;
            }
        }

        // Timer
        function formatTime(seconds) {
            const hrs = Math.floor(seconds / 3600);
            const mins = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;
            if (hrs > 0) {
                return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }

        function getElapsedTime() {
            if (!startTime) return 0;
            return Math.floor((Date.now() - startTime) / 1000);
        }

        function getRemainingTime() {
            const elapsed = getElapsedTime();
            const total = 90 * 60; // 90 minutes
            return Math.max(0, total - elapsed);
        }

        function startTimer() {
            startTime = Date.now();
            timerInterval = setInterval(() => {
                const timerEl = document.getElementById('timer');
                if (timerEl) {
                    const remaining = getRemainingTime();
                    timerEl.textContent = formatTime(remaining);
                    if (remaining <= 0) {
                        endExam();
                    }
                }
            }, 1000);
        }

        function stopTimer() {
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
        }

        function endExam() {
            examFinished = true;
            stopTimer();
            render();
        }

        // Score calculation
        function calculateScore() {
            let correct = 0;
            let wrong = 0;

            examData.questions.forEach((q, index) => {
                const userAnswer = answers[index];
                if (userAnswer !== undefined) {
                    if (q.multiSelect) {
                        const correctIds = q.answers.filter(a => a.isCorrect).map(a => a.id).sort();
                        const userIds = [...userAnswer].sort();
                        if (JSON.stringify(correctIds) === JSON.stringify(userIds)) {
                            correct++;
                        } else {
                            wrong++;
                        }
                    } else {
                        const correctAnswer = q.answers.find(a => a.isCorrect);
                        if (userAnswer === correctAnswer.id) {
                            correct++;
                        } else {
                            wrong++;
                        }
                    }
                }
            });

            return { correct, wrong, total: examData.questions.length };
        }

        function isQuestionCorrect(index) {
            const q = examData.questions[index];
            const userAnswer = answers[index];
            if (userAnswer === undefined) return null;

            if (q.multiSelect) {
                const correctIds = q.answers.filter(a => a.isCorrect).map(a => a.id).sort();
                const userIds = [...userAnswer].sort();
                return JSON.stringify(correctIds) === JSON.stringify(userIds);
            } else {
                const correctAnswer = q.answers.find(a => a.isCorrect);
                return userAnswer === correctAnswer.id;
            }
        }

        function shouldShowPracticeResult(index) {
            if (examMode !== 'practice') return false;
            const q = examData.questions[index];
            if (!q) return false;
            const userAnswer = answers[index];
            if (userAnswer === undefined) return false;
            if (!q.multiSelect) return true;
            return practiceRevealedQuestions.has(index);
        }

        function updateHeader() {
            const headerRight = document.getElementById('headerRight');
            if (examStarted && !examFinished) {
                headerRight.innerHTML = `
                    <div class="header-item timer-box">
                        <span class="timer-icon">⏱</span>
                        <span id="timer">${formatTime(getRemainingTime())}</span>
                    </div>
                    <button class="end-exam-btn" id="endExamBtn">End Exam</button>
                `;
                
                document.getElementById('endExamBtn').addEventListener('click', () => {
                    if (confirm('Are you sure you want to end the exam?')) {
                        endExam();
                    }
                });
            } else {
                headerRight.innerHTML = '';
            }
        }

        // Render functions
        function render() {
            const app = document.getElementById('app');
            updateHeader();
            
            if (!examData) {
                app.innerHTML = '<p style="padding: 40px; text-align: center;">Loading...</p>';
                return;
            }

            if (!examStarted) {
                app.innerHTML = renderStartScreen();
            } else if (examFinished) {
                app.innerHTML = renderResultsScreen();
            } else {
                app.innerHTML = renderExamScreen();
            }

            attachEventListeners();
        }

        function renderStartScreen() {
            const availableCount = getAvailableQuestionsCount();
            const examQuestionCount = Math.min(examData.questionsPerExam, availableCount);
            
            return `
                <div class="start-screen">
                    <div class="start-card">
                        <div class="start-logo">
                            <img src="images/kcsa-logo.png" alt="KCSA Logo" loading="lazy">
                        </div>
                        <h1 class="start-title">KCSA Practice Exam</h1>
                        <p class="start-subtitle">Kubernetes and Cloud Native Security Associate Certification</p>
                        
                        <div class="exam-info-grid">
                            <div class="info-item">
                                <div class="info-value">${examQuestionCount}</div>
                                <div class="info-label">Questions</div>
                            </div>
                            <div class="info-item">
                                <div class="info-value">${availableCount}</div>
                                <div class="info-label">Available</div>
                            </div>
                            <div class="info-item">
                                <div class="info-value">${examData.passingScore}%</div>
                                <div class="info-label">Passing Score</div>
                            </div>
                            <div class="info-item">
                                <div class="info-value">90</div>
                                <div class="info-label">Minutes</div>
                            </div>
                        </div>

                        <div class="mode-selector">
                            <div class="mode-option ${examMode === 'exam' ? 'active' : ''}" data-mode="exam">
                                <div class="mode-icon">📝</div>
                                <div class="mode-name">Exam Mode</div>
                                <div class="mode-desc">Timed, results at end</div>
                            </div>
                            <div class="mode-option ${examMode === 'practice' ? 'active' : ''}" data-mode="practice">
                                <div class="mode-icon">📚</div>
                                <div class="mode-name">Practice Mode</div>
                                <div class="mode-desc">Instant feedback</div>
                            </div>
                        </div>

                        <div class="domain-section">
                            <div class="domain-section-title">
                                <span>📚 Select Topic Areas</span>
                                <span class="domain-toggle-all" id="toggleAllDomains">
                                    ${selectedDomains.size === allDomains.length ? 'Deselect All' : 'Select All'}
                                </span>
                            </div>
                            <div class="domain-grid">
                                ${allDomains.map(domain => `
                                    <label class="domain-checkbox ${selectedDomains.has(domain.name) ? 'checked' : ''}" data-domain="${domain.name}">
                                        <input type="checkbox" ${selectedDomains.has(domain.name) ? 'checked' : ''}>
                                        <span class="domain-checkbox-label">${domain.name}</span>
                                        <span class="domain-count">${domain.count}</span>
                                    </label>
                                `).join('')}
                            </div>
                            <div class="selected-questions-info">
                                <strong>${availableCount}</strong> questions available from <strong>${selectedDomains.size}</strong> selected topics
                                ${availableCount < examData.questionsPerExam ? 
                                    ` (Exam will have ${examQuestionCount} questions)` : ''}
                            </div>
                        </div>

                        <button class="start-btn" id="startBtn" ${availableCount === 0 ? 'disabled' : ''}>
                            ${availableCount === 0 ? 'Select at least one topic' : 'Begin Examination'}
                        </button>
                    </div>
                </div>
            `;
        }

        function renderExamScreen() {
            const q = examData.questions[currentQuestion];
            const score = calculateScore();
            const answeredCount = Object.keys(answers).length;
            const progress = (answeredCount / examData.questions.length) * 100;
            const userAnswer = answers[currentQuestion];
            const isAnswered = userAnswer !== undefined;
            const showExplanation = shouldShowPracticeResult(currentQuestion);
            const isFlagged = flaggedQuestions.has(currentQuestion);
            const needsPracticeCheck = examMode === 'practice' && q.multiSelect && !showExplanation;

            return `
                <div class="main-container">
                    <!-- Sidebar -->
                    <aside class="sidebar">
                        <div class="sidebar-header">
                            <div class="sidebar-title">Progress</div>
                            <div class="progress-info">
                                <span>${answeredCount} of ${examData.questions.length} answered</span>
                                <span>${Math.round(progress)}%</span>
                            </div>
                            <div class="progress-bar-container">
                                <div class="progress-bar" style="width: ${progress}%"></div>
                            </div>
                        </div>
                        
                        <div class="question-nav">
                            <div class="nav-section-title">Questions</div>
                            <div class="question-grid">
                                ${examData.questions.map((_, i) => {
                                    let btnClass = 'question-btn';
                                    if (i === currentQuestion) btnClass += ' current';
                                    if (answers[i] !== undefined) btnClass += ' answered';
                                    if (flaggedQuestions.has(i)) btnClass += ' flagged';
                                    
                                    if (examFinished || shouldShowPracticeResult(i)) {
                                        const result = isQuestionCorrect(i);
                                        if (result === true) btnClass += ' correct';
                                        else if (result === false) btnClass += ' wrong';
                                    }
                                    
                                    return `<button class="${btnClass}" data-question="${i}">${i + 1}</button>`;
                                }).join('')}
                            </div>
                        </div>
                        
                        <div class="sidebar-legend">
                            <div class="legend-item">
                                <div class="legend-box current"></div>
                                <span>Current</span>
                            </div>
                            <div class="legend-item">
                                <div class="legend-box answered"></div>
                                <span>Answered</span>
                            </div>
                            <div class="legend-item">
                                <div class="legend-box flagged"></div>
                                <span>Flagged for Review</span>
                            </div>
                        </div>
                    </aside>

                    <!-- Content -->
                    <main class="content-area">
                        <div class="question-header-bar">
                            <div class="question-info">
                                <span class="question-number-display">Question ${currentQuestion + 1} of ${examData.questions.length}</span>
                                <span class="question-type-badge ${q.multiSelect ? 'badge-multi' : 'badge-single'}">
                                    ${q.multiSelect ? 'Multiple Choice' : 'Single Choice'}
                                </span>
                                ${q.domain ? `<span class="domain-badge">${q.domain}</span>` : ''}
                            </div>
                            <button class="flag-btn ${isFlagged ? 'active' : ''}" id="flagBtn">
                                🚩 ${isFlagged ? 'Flagged' : 'Flag for Review'}
                            </button>
                        </div>

                        <div class="question-content">
                            <div class="question-card">
                                <div class="question-text-area">
                                    <p class="question-text">${q.question}</p>
                                </div>
                                
                                <div class="answers-area">
                                    ${q.answers.map(answer => {
                                        let answerClass = 'answer-option';
                                        let isSelected = false;
                                        
                                        if (q.multiSelect) {
                                            isSelected = userAnswer && userAnswer.includes(answer.id);
                                        } else {
                                            isSelected = userAnswer === answer.id;
                                        }
                                        
                                        if (showExplanation) {
                                            answerClass += ' disabled';
                                            if (answer.isCorrect) {
                                                answerClass += isSelected ? ' correct' : ' show-correct';
                                            } else if (isSelected) {
                                                answerClass += ' wrong';
                                            }
                                        } else {
                                            if (isSelected) answerClass += ' selected';
                                        }
                                        
                                        let marker = answer.id;
                                        if (showExplanation) {
                                            if (answer.isCorrect) marker = '✓';
                                            else if (isSelected && !answer.isCorrect) marker = '✗';
                                        }
                                        
                                        return `
                                            <div class="${answerClass}" data-answer="${answer.id}">
                                                <div class="answer-marker">${marker}</div>
                                                <div class="answer-text">${answer.text}</div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>

                                ${showExplanation ? `
                                    <div class="explanation-box">
                                        <div class="explanation-title">
                                            💡 Explanation
                                        </div>
                                        <p class="explanation-text">
                                            ${q.answers.find(a => a.isCorrect).explanation}
                                        </p>
                                    </div>
                                ` : ''}
                            </div>
                        </div>

                        <div class="nav-footer">
                            <button class="nav-btn" id="prevBtn" ${currentQuestion === 0 ? 'disabled' : ''}>
                                ← Previous
                            </button>
                            <div style="display: flex; gap: 10px;">
                                ${needsPracticeCheck ? `
                                    <button class="nav-btn nav-btn-primary" id="checkAnswerBtn" ${!isAnswered ? 'disabled' : ''}>
                                        Check Answer
                                    </button>
                                ` : ''}
                                ${Object.keys(answers).length === examData.questions.length ? `
                                    <button class="nav-btn nav-btn-primary" id="finishBtn">
                                        Submit Exam
                                    </button>
                                ` : ''}
                                <button class="nav-btn nav-btn-primary" id="nextBtn" ${currentQuestion === examData.questions.length - 1 ? 'disabled' : ''}>
                                    Next →
                                </button>
                            </div>
                        </div>
                    </main>
                </div>
            `;
        }

        function renderResultsScreen() {
            const score = calculateScore();
            const percentage = Math.round((score.correct / score.total) * 100);
            const passed = percentage >= examData.passingScore;
            const elapsedTime = getElapsedTime();

            return `
                <div class="results-screen">
                    <div class="results-card">
                        <div class="result-icon ${passed ? 'passed' : 'failed'}">
                            ${passed ? '🏆' : '📚'}
                        </div>
                        
                        <h2 class="result-title ${passed ? 'passed' : 'failed'}">
                            ${passed ? 'PASSED' : 'NOT PASSED'}
                        </h2>
                        <p class="result-subtitle">
                            ${passed 
                                ? 'Congratulations! You have passed the examination.' 
                                : 'Keep studying and try again. You can do it!'}
                        </p>

                        <div class="score-display">
                            <div class="score-item">
                                <div class="score-value correct">${score.correct}</div>
                                <div class="score-label">Correct</div>
                            </div>
                            <div class="score-item">
                                <div class="score-value wrong">${score.wrong}</div>
                                <div class="score-label">Incorrect</div>
                            </div>
                            <div class="score-item">
                                <div class="score-value percent">${percentage}%</div>
                                <div class="score-label">Score</div>
                            </div>
                            <div class="score-item">
                                <div class="score-value" style="color: var(--text-medium);">${formatTime(elapsedTime)}</div>
                                <div class="score-label">Time</div>
                            </div>
                        </div>

                        <div class="score-bar-container">
                            <div class="score-bar-bg">
                                <div class="score-bar-fill ${passed ? 'passed' : 'failed'}" style="width: ${percentage}%"></div>
                                <div class="passing-line"></div>
                            </div>
                            <div class="passing-label">${examData.passingScore}% required to pass</div>
                        </div>

                        <div class="results-actions">
                            <button class="result-btn result-btn-secondary" id="reviewBtn">
                                📋 Review Answers
                            </button>
                            <button class="result-btn result-btn-primary" id="restartBtn">
                                🔄 New Exam
                            </button>
                        </div>

                        <div class="review-section">
                            <div class="review-header">
                                <h3 class="review-title">Question Overview</h3>
                                <div class="review-filters">
                                    <button class="filter-btn ${reviewFilter === 'all' ? 'active' : ''}" data-filter="all">All</button>
                                    <button class="filter-btn ${reviewFilter === 'correct' ? 'active' : ''}" data-filter="correct">Correct</button>
                                    <button class="filter-btn ${reviewFilter === 'wrong' ? 'active' : ''}" data-filter="wrong">Incorrect</button>
                                </div>
                            </div>
                            
                            <div class="review-grid">
                                ${examData.questions.map((_, i) => {
                                    const result = isQuestionCorrect(i);
                                    let btnClass = 'review-btn';
                                    if (result === true) btnClass += ' correct';
                                    else if (result === false) btnClass += ' wrong';
                                    
                                    if (reviewFilter === 'correct' && result !== true) return '';
                                    if (reviewFilter === 'wrong' && result !== false) return '';
                                    
                                    return `<button class="${btnClass}" data-review="${i}">${i + 1}</button>`;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // Event handlers
        function attachEventListeners() {
            document.querySelectorAll('.mode-option').forEach(option => {
                option.addEventListener('click', () => {
                    examMode = option.dataset.mode;
                    render();
                });
            });

            // Domain selection handlers
            const toggleAllDomains = document.getElementById('toggleAllDomains');
            if (toggleAllDomains) {
                toggleAllDomains.addEventListener('click', () => {
                    if (selectedDomains.size === allDomains.length) {
                        selectedDomains.clear();
                    } else {
                        allDomains.forEach(d => selectedDomains.add(d.name));
                    }
                    render();
                });
            }

            document.querySelectorAll('.domain-checkbox').forEach(checkbox => {
                checkbox.addEventListener('click', (e) => {
                    e.preventDefault();
                    const domain = checkbox.dataset.domain;
                    if (selectedDomains.has(domain)) {
                        selectedDomains.delete(domain);
                    } else {
                        selectedDomains.add(domain);
                    }
                    render();
                });
            });

            const startBtn = document.getElementById('startBtn');
            if (startBtn && !startBtn.disabled) {
                startBtn.addEventListener('click', () => {
                    // Select questions based on chosen domains
                    examData.questions = selectRandomQuestions();
                    practiceRevealedQuestions.clear();
                    examStarted = true;
                    startTimer();
                    render();
                });
            }

            document.querySelectorAll('.answer-option:not(.disabled)').forEach(option => {
                option.addEventListener('click', () => {
                    const q = examData.questions[currentQuestion];
                    const answerId = option.dataset.answer;
                    
                    if (q.multiSelect) {
                        if (!answers[currentQuestion]) {
                            answers[currentQuestion] = [];
                        }
                        const idx = answers[currentQuestion].indexOf(answerId);
                        if (idx > -1) {
                            answers[currentQuestion].splice(idx, 1);
                        } else {
                            answers[currentQuestion].push(answerId);
                        }
                        if (answers[currentQuestion].length === 0) {
                            delete answers[currentQuestion];
                        }
                    } else {
                        answers[currentQuestion] = answerId;
                    }

                    if (examMode === 'practice' && !q.multiSelect) {
                        practiceRevealedQuestions.add(currentQuestion);
                    }
                    render();
                });
            });

            const checkAnswerBtn = document.getElementById('checkAnswerBtn');
            if (checkAnswerBtn) {
                checkAnswerBtn.addEventListener('click', () => {
                    if (answers[currentQuestion] !== undefined) {
                        practiceRevealedQuestions.add(currentQuestion);
                        render();
                    }
                });
            }

            const flagBtn = document.getElementById('flagBtn');
            if (flagBtn) {
                flagBtn.addEventListener('click', () => {
                    if (flaggedQuestions.has(currentQuestion)) {
                        flaggedQuestions.delete(currentQuestion);
                    } else {
                        flaggedQuestions.add(currentQuestion);
                    }
                    render();
                });
            }

            const prevBtn = document.getElementById('prevBtn');
            if (prevBtn) {
                prevBtn.addEventListener('click', () => {
                    if (currentQuestion > 0) {
                        currentQuestion--;
                        render();
                    }
                });
            }

            const nextBtn = document.getElementById('nextBtn');
            if (nextBtn) {
                nextBtn.addEventListener('click', () => {
                    if (currentQuestion < examData.questions.length - 1) {
                        currentQuestion++;
                        render();
                    }
                });
            }

            document.querySelectorAll('.question-btn[data-question]').forEach(btn => {
                btn.addEventListener('click', () => {
                    currentQuestion = parseInt(btn.dataset.question);
                    render();
                });
            });

            const finishBtn = document.getElementById('finishBtn');
            if (finishBtn) {
                finishBtn.addEventListener('click', () => {
                    if (confirm('Are you sure you want to submit the exam?')) {
                        endExam();
                    }
                });
            }

            const restartBtn = document.getElementById('restartBtn');
            if (restartBtn) {
                restartBtn.addEventListener('click', () => {
                    currentQuestion = 0;
                    answers = {};
                    flaggedQuestions.clear();
                    practiceRevealedQuestions.clear();
                    examStarted = false;
                    examFinished = false;
                    startTime = null;
                    reviewFilter = 'all';
                    examData.questions = []; // Will be selected when new exam starts
                    render();
                });
            }

            const reviewBtn = document.getElementById('reviewBtn');
            if (reviewBtn) {
                reviewBtn.addEventListener('click', () => {
                    examFinished = false;
                    examMode = 'practice';
                    examData.questions.forEach((q, i) => {
                        if (q.multiSelect && answers[i] !== undefined) {
                            practiceRevealedQuestions.add(i);
                        }
                    });
                    currentQuestion = 0;
                    render();
                });
            }

            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    reviewFilter = btn.dataset.filter;
                    render();
                });
            });

            document.querySelectorAll('.review-btn[data-review]').forEach(btn => {
                btn.addEventListener('click', () => {
                    examFinished = false;
                    examMode = 'practice';
                    examData.questions.forEach((q, i) => {
                        if (q.multiSelect && answers[i] !== undefined) {
                            practiceRevealedQuestions.add(i);
                        }
                    });
                    currentQuestion = parseInt(btn.dataset.review);
                    render();
                });
            });
        }

        // Initialize
        loadQuestions();
