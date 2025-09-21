document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('pdfFile');
    const uploadBtn = document.getElementById('uploadBtn');
    const loadingDiv = document.getElementById('loading');
    const summaryOutput = document.getElementById('summary-output');
    const summaryContent = document.getElementById('summaryContent');
    const errorDiv = document.getElementById('error-message');
    const fileNameSpan = document.getElementById('fileName');

    // New chatbot elements
    const chatbotContainer = document.getElementById('chatbot-container');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');

    // Helper function to process bold text
    function processBoldText(text) {
        return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    }

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            fileNameSpan.textContent = fileInput.files[0].name;
            uploadBtn.disabled = false;
        } else {
            fileNameSpan.textContent = '';
            uploadBtn.disabled = true;
        }
    });

    uploadBtn.addEventListener('click', async () => {
        const file = fileInput.files[0];
        if (!file) {
            alert('Please select a PDF file first.');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        summaryOutput.style.display = 'none';
        errorDiv.style.display = 'none';
        loadingDiv.style.display = 'block';
        chatbotContainer.style.display = 'none'; // Hide chat during processing

        try {
            const response = await fetch('http://localhost:3000/upload', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Server responded with an error');
            }

            const data = await response.json();

            if (data.summary) {
                displayFormattedSummary(data.summary);
                summaryOutput.style.display = 'block';
                
                // Enable the chatbot after successful document processing
                chatbotContainer.style.display = 'flex';
                chatInput.disabled = false;
                chatSendBtn.disabled = false;
                chatMessages.innerHTML = `<div class="bot-message"><p>Hi there! I've processed the document. Ask me any questions you have about it.</p></div>`;
            } else {
                throw new Error('No summary found in the response');
            }

        } catch (error) {
            console.error('Error:', error);
            errorDiv.style.display = 'block';
        } finally {
            loadingDiv.style.display = 'none';
        }
    });

    function displayFormattedSummary(summaryText) {
        summaryContent.innerHTML = '';
        const sections = summaryText.split(/\n{2,}/);

        sections.forEach(section => {
            let processedSection = section.trim();
            if (processedSection === '') return;

            const headerMatch = processedSection.match(/^(📌|✅|⚖️|💡)\s*\*\*(.*?)\*\*/);
            
            if (headerMatch) {
                const icon = headerMatch[1];
                const title = headerMatch[2];
                const header = document.createElement('h3');
                header.innerHTML = `${icon} ${title}`;
                summaryContent.appendChild(header);
            } else if (processedSection.startsWith('-')) {
                const list = document.createElement('ul');
                const listItems = processedSection.split('\n').filter(line => line.trim().startsWith('-'));
                listItems.forEach(itemText => {
                    const li = document.createElement('li');
                    let content = itemText.replace(/^- /, '').trim();
                    content = processBoldText(content);
                    li.innerHTML = content;
                    list.appendChild(li);
                });
                summaryContent.appendChild(list);
            } else {
                const p = document.createElement('p');
                let content = processedSection.replace(/\n/g, '<br>');
                content = processBoldText(content);
                p.innerHTML = content;
                summaryContent.appendChild(p);
            }
        });
    }

    // --- NEW CHATBOT LOGIC ---

    const sendMessage = async () => {
        const question = chatInput.value.trim();
        if (question === "") return;

        // Display user's message
        appendMessage(question, 'user-message');
        chatInput.value = '';
        chatInput.disabled = true;
        chatSendBtn.disabled = true;

        // Display typing indicator
        const botTypingIndicator = document.createElement('div');
        botTypingIndicator.className = 'bot-message typing-indicator';
        botTypingIndicator.innerHTML = '<span></span><span></span><span></span>';
        chatMessages.appendChild(botTypingIndicator);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        try {
            const response = await fetch('http://localhost:3000/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question }),
            });

            if (!response.ok) {
                throw new Error('Chatbot failed to respond.');
            }

            const data = await response.json();
            
            // Remove typing indicator
            chatMessages.removeChild(botTypingIndicator);
            
            // Display bot's response
            appendMessage(data.answer, 'bot-message');

        } catch (error) {
            console.error('Chat error:', error);
            chatMessages.removeChild(botTypingIndicator);
            appendMessage("Sorry, I couldn't get an answer. Please try again.", 'bot-message error-message-chat');
        } finally {
            chatInput.disabled = false;
            chatSendBtn.disabled = false;
            chatInput.focus();
        }
    };

    chatSendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            sendMessage();    
        }
    });

    const appendMessage = (text, className) => {
        const messageElement = document.createElement('div');
        messageElement.className = className;
        messageElement.innerHTML = `<p>${text}</p>`;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll to the bottom
    };
});