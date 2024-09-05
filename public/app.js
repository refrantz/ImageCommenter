const socket = io();
let currentProject = '';
let currentRevisionIndex = 0;

document.addEventListener('DOMContentLoaded', function() {
    if (!localStorage.getItem('username')) {
        document.getElementById('usernamePrompt').style.display = 'block';
    } else {
        loadProjects();
    }
});

function saveUsername() {
    const username = document.getElementById('username').value;
    if (!username) {
        alert('Username cannot be empty!');
        return;
    }
    localStorage.setItem('username', username);
    document.getElementById('usernamePrompt').style.display = 'none';
    loadProjects();
}

function loadProjects() {
    fetch('/projects').then(response => response.json()).then(projectIds => {
        const projectsList = document.getElementById('projectsList');
        projectsList.innerHTML = '';
        projectIds.forEach(projectId => {
            fetch(`/project/${projectId}`).then(response => response.json()).then(project => {
                const listItem = document.createElement('li');
                listItem.textContent = `${project.name} (${project.revisions.length} revision(s))`;
                listItem.onclick = () => selectProject(projectId);
                projectsList.appendChild(listItem);
            });
        });
    });
}

function selectProject(projectId) {
    currentProject = projectId;
    fetch(`/project/${projectId}`)
        .then(response => response.json())
        .then(project => {
            const revisionsList = document.getElementById('revisionsList');
            revisionsList.innerHTML = '';
            project.revisions.forEach((revision, index) => {
                const listItem = document.createElement('li');
                listItem.textContent = `Revision ${index + 1}`;
                listItem.onclick = () => selectRevision(index);
                revisionsList.appendChild(listItem);
            });
            if (project.revisions.length > 0) {
                selectRevision(0);
            }
        });
}

function selectRevision(index) {
    currentRevisionIndex = index;
    fetch(`/project/${currentProject}`)
        .then(response => response.json())
        .then(project => {
            const image = document.getElementById('currentImage');
            image.onload = () => {
                setupCanvas(image);
                socket.emit('getProjectPoints', currentProject, currentRevisionIndex);
            };
            image.src = `images/${project.revisions[index].filename}`;
        });
}

function selectImage(filename) {
    currentImage = filename;
    const image = document.getElementById('currentImage');
    image.onload = () => {
        setupCanvas(image);
        socket.emit('getImagePoints', filename); // Request points when the image is loaded
    };
    image.src = `images/${filename}`;
}

function setupCanvas(image) {
    const canvas = document.getElementById('imageCanvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        if (!checkForPoint(x, y)) {
            showCommentForm(x, y);
        } else {
            e.preventDefault(); // Prevent any other actions if a point is found
        }
    });
}

function showCommentForm(x, y) {
    const commentForm = document.getElementById('commentForm');
    const commentBox = document.getElementById('commentBox');
    commentBox.value = '';
    commentForm.style.display = 'block';
    commentBox.focus();
    currentPoint = { x, y }; // Set the current point for new comments

    // Adjust position if necessary
    const rect = commentForm.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    if (rect.bottom > viewportHeight) {
        commentForm.style.top = `${viewportHeight - rect.height - 20}px`;
    }
}

function submitComment() {
    const commentText = document.getElementById('commentBox').value;
    const username = localStorage.getItem('username');
    if (!commentText.trim()) {
        alert('Please enter a comment.');
        return;
    }
    const data = {
        username,
        text: commentText,
        projectId: currentProject,
        revisionIndex: currentRevisionIndex,
        x: currentPoint.x,
        y: currentPoint.y
    };
    socket.emit('addPoint', data);
    document.getElementById('commentForm').style.display = 'none';
}

function drawPoint(x, y, index) {
    const canvas = document.getElementById('imageCanvas');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.font = "12px Arial";
    ctx.fillText(index.toString(), x + 8, y + 3);
    return {x, y, index};
}

function appendComment(point, index) {
    const listItem = document.createElement('li');
    listItem.textContent = `Point ${index}: ${point.comments[0].username} - ${point.comments[0].text}`;
    listItem.onmouseover = () => highlightPoint(point.x, point.y);
    listItem.onmouseout = () => unhighlightPoint(point.x, point.y);
    listItem.onclick = () => toggleChat(point, index);
    document.getElementById('comments').appendChild(listItem);

    // Create a non-visible element to store point data for interaction
    let bubble = document.createElement('div');
    bubble.className = 'comment-bubble';
    bubble.style.position = 'absolute';
    bubble.style.left = `${point.x}px`; // Position should match the point on canvas
    bubble.style.top = `${point.y}px`;
    bubble.style.display = 'none'; // Initially hidden, not needed visually
    bubble.dataset.point = JSON.stringify(point);
    bubble.dataset.index = index.toString();
    document.getElementById('imageCanvasContainer').appendChild(bubble);
}


function toggleChat(point, index) {
    const chatDiv = document.getElementById('chat');
    chatDiv.dataset.currentPointIndex = index;
    if (!chatDiv) {
        console.error('Chat div not found!');
        return;
    }

    const canvasRect = document.getElementById('imageCanvas').getBoundingClientRect();
    const xPos = point.x + canvasRect.left;
    const yPos = point.y + canvasRect.top;

    chatDiv.style.left = `${xPos + 20}px`;
    chatDiv.style.top = `${yPos}px`;
    chatDiv.style.display = 'block';
    chatDiv.innerHTML = '';

    const title = document.createElement('h3');
    title.textContent = `Chat for Point ${index}`;
    chatDiv.appendChild(title);

    point.comments.forEach(comment => {
        const commentP = document.createElement('p');
        commentP.textContent = `${comment.username}: ${comment.text}`;
        chatDiv.appendChild(commentP);
    });

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Write a comment...';
    chatDiv.appendChild(input);

    const button = document.createElement('button');
    button.textContent = 'Send';
    button.onclick = () => {
        const commentText = input.value;
        if (!commentText.trim()) {
            alert('Comment cannot be empty.');
            return;
        }
        socket.emit('addComment', {
            projectId: currentProject,
            revisionIndex: currentRevisionIndex,
            x: point.x,
            y: point.y,
            username: localStorage.getItem('username'),
            text: commentText
        });
        input.value = '';
    };
    chatDiv.appendChild(button);

    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.onclick = () => {
        chatDiv.style.display = 'none';
        chatDiv.removeAttribute('data-currentPointIndex');
    };
    chatDiv.appendChild(closeButton);
}

function highlightPoint(x, y) {
    const canvas = document.getElementById('imageCanvas');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'blue';
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, 2 * Math.PI);
    ctx.fill();
}

function unhighlightPoint(x, y) {
    const canvas = document.getElementById('imageCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(x-10, y-10, 20, 20);
    drawPoint(x, y, '*'); // Need to pass the correct index here
}

function checkForPoint(x, y) {
    const points = Array.from(document.querySelectorAll('.comment-bubble')); // Ensure this selector is correct
    let found = false;
    points.forEach(point => {
        const pointX = parseInt(point.style.left, 10);
        const pointY = parseInt(point.style.top, 10);
        if (Math.sqrt((pointX - x) ** 2 + (pointY - y) ** 2) < 10) { // Adjust detection radius if needed
            console.log("Point found, triggering chat:", point.dataset.point, point.dataset.index);
            toggleChat(JSON.parse(point.dataset.point), JSON.parse(point.dataset.index));
            found = true;
        }
    });
    return found;
}

function loadComments() {
    fetch(`/comments?image=${currentImage}`).then(response => response.json()).then(comments => {
        document.getElementById('comments').innerHTML = ''; // Clear previous comments
        comments.forEach((comment, index) => {
            const point = drawPoint(comment.x, comment.y, index + 1);
            appendComment(comment, index + 1);
        });
    });
}

function createNewRevision() {
    if (!currentProject) {
        alert('Please select a project first.');
        return;
    }
    const formData = new FormData();
    const imageFiles = document.getElementById('revisionImageInput').files;
    if (imageFiles.length === 0) {
        alert('Please select an image file for the new revision.');
        return;
    }
    formData.append('image', imageFiles[0]);

    fetch(`/project/${currentProject}/revision`, {
        method: 'POST',
        body: formData,
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('New revision created successfully!');
            selectProject(currentProject); // Reload the project to show the new revision
        } else {
            alert('Failed to create new revision.');
        }
    })
    .catch(error => {
        console.error('Error creating new revision:', error);
        alert('Error creating new revision.');
    });
}

// Add event listener for the revision form
document.getElementById('revisionForm').addEventListener('submit', function(e) {
    e.preventDefault();
    createNewRevision();
});

socket.on('updatePoints', (data) => {
    if (data.projectId === currentProject && data.revisionIndex === currentRevisionIndex) {
        document.getElementById('comments').innerHTML = '';
        data.points.forEach((point, index) => {
            drawPoint(point.x, point.y, index + 1);
            appendComment(point, index + 1);
        });
        if (document.getElementById('chat').style.display !== 'none' && document.getElementById('chat').dataset.currentPointIndex) {
            const currentPointIndex = document.getElementById('chat').dataset.currentPointIndex;
            toggleChat(data.points[currentPointIndex - 1], currentPointIndex);
        }
    }
});

document.getElementById('uploadForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const formData = new FormData(this);
    const projectName = document.getElementById('projectName').value;
    if (!projectName.trim()) {
        alert('Please enter a project name.');
        return;
    }
    formData.append('projectName', projectName);

    fetch('/project', {
        method: 'POST',
        body: formData,
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('Project created successfully!');
            loadProjects();
            this.reset(); // Reset the form
        } else {
            alert('Failed to create project: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Error creating project:', error);
        alert('Error creating project.');
    });
});

