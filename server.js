const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const multer  = require('multer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const upload = multer({ dest: 'public/images/' });  // Images will be stored in the public/images directory


let projects = {};  // Store comments for each image with coordinates and multiple comments per point

app.use(express.static('public'));

app.get('/projects', (req, res) => {
    res.json(Object.keys(projects));
});

app.get('/project/:projectId', (req, res) => {
    const projectId = req.params.projectId;
    if (projects[projectId]) {
        res.json(projects[projectId]);
    } else {
        res.status(404).json({ error: 'Project not found' });
    }
});

app.post('/project', upload.single('image'), (req, res) => {
    const projectName = req.body.projectName;
    if (!projectName) {
        return res.status(400).json({ success: false, error: 'Project name is required' });
    }
    const tempPath = req.file.path;
    const targetPath = path.join(__dirname, 'public/images', req.file.originalname);

    fs.rename(tempPath, targetPath, err => {
        if (err) return res.status(500).json({ success: false, error: 'Failed to save image' });

        const projectId = Date.now().toString();
        projects[projectId] = {
            name: projectName,
            revisions: [{
                filename: req.file.originalname,
                comments: []
            }]
        };

        res.json({ success: true, projectId: projectId });
    });
});

app.post('/project/:projectId/revision', upload.single('image'), (req, res) => {
    const projectId = req.params.projectId;
    if (!projects[projectId]) {
        return res.status(404).json({ error: 'Project not found' });
    }

    const tempPath = req.file.path;
    const targetPath = path.join(__dirname, 'public/images', req.file.originalname);

    fs.rename(tempPath, targetPath, err => {
        if (err) return res.status(500).json({ success: false });

        projects[projectId].revisions.push({
            filename: req.file.originalname,
            comments: []
        });

        res.json({ success: true });
    });
});

app.get('/images', (req, res) => {
    fs.readdir('public/images', (err, files) => {
        if (err) {
            res.send('Unable to fetch images');
            return;
        }
        res.json(files);
    });
});

app.post('/upload', upload.single('image'), (req, res) => {
    const tempPath = req.file.path;
    const targetPath = path.join(__dirname, 'public/images', req.file.originalname);

    // Rename the file to its original name
    fs.rename(tempPath, targetPath, err => {
        if (err) return res.sendStatus(500).json({ success: false });

        res.json({ success: true });
    });
});

io.on('connection', (socket) => {
    socket.on('getProjectPoints', (projectId, revisionIndex) => {
        if (projects[projectId] && projects[projectId].revisions[revisionIndex]) {
            socket.emit('updatePoints', {
                projectId: projectId,
                revisionIndex: revisionIndex,
                points: projects[projectId].revisions[revisionIndex].comments
            });
        }
    });

    socket.on('addPoint', (data) => {
        const { projectId, revisionIndex, x, y, username, text } = data;
        if (!projects[projectId] || !projects[projectId].revisions[revisionIndex]) {
            return;
        }
        const comments = projects[projectId].revisions[revisionIndex].comments;
        const existingPoint = comments.find(p => Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) < 20);
        if (!existingPoint) {
            comments.push({
                x, y,
                comments: [{username, text}]
            });
        } else {
            existingPoint.comments.push({username, text});
        }
        io.emit('updatePoints', {
            projectId: projectId,
            revisionIndex: revisionIndex,
            points: comments
        });
    });

    socket.on('addComment', (data) => {
        const { projectId, revisionIndex, x, y, username, text } = data;
        if (!projects[projectId] || !projects[projectId].revisions[revisionIndex]) {
            return;
        }
        const comments = projects[projectId].revisions[revisionIndex].comments;
        const point = comments.find(p => Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) < 20);
        if (point) {
            point.comments.push({username, text});
            io.emit('updatePoints', {
                projectId: projectId,
                revisionIndex: revisionIndex,
                points: comments
            });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
