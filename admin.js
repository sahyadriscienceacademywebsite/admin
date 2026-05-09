document.addEventListener('DOMContentLoaded', () => {
  // Tabs logic
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  // Config logic
  const ghOwner = document.getElementById('ghOwner');
  const ghRepo = document.getElementById('ghRepo');
  const ghToken = document.getElementById('ghToken');

  ghOwner.value = localStorage.getItem('ghOwner') || '';
  ghRepo.value = localStorage.getItem('ghRepo') || '';
  ghToken.value = localStorage.getItem('ghToken') || '';

  // Modal logic
  const settingsModal = document.getElementById('settingsModal');
  document.getElementById('openSettingsBtn').addEventListener('click', () => {
    settingsModal.style.display = 'flex';
  });
  document.getElementById('closeSettingsBtn').addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });

  document.getElementById('saveConfigBtn').addEventListener('click', () => {
    localStorage.setItem('ghOwner', ghOwner.value.trim());
    localStorage.setItem('ghRepo', ghRepo.value.trim());
    localStorage.setItem('ghToken', ghToken.value.trim());
    setStatus('configStatus', 'Saved!', 'success');
    setTimeout(() => {
      settingsModal.style.display = 'none';
    }, 800);
  });

  function setStatus(elementId, msg, type) {
    const el = document.getElementById(elementId);
    el.textContent = msg;
    el.className = `status-msg ${type}`;
    setTimeout(() => { el.textContent = ''; }, 4000);
  }

  // GitHub API Wrapper
  async function fetchFileFromGithub(path) {
    const owner = localStorage.getItem('ghOwner');
    const repo = localStorage.getItem('ghRepo');
    const token = localStorage.getItem('ghToken');
    
    if (!owner || !repo || !token) {
      throw new Error("Missing GitHub configuration");
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) throw new Error("Failed to fetch file from GitHub");
    
    const data = await response.json();
    // decode base64 utf-8 safely
    const content = decodeURIComponent(escape(atob(data.content)));
    return { content: JSON.parse(content), sha: data.sha };
  }

  async function pushFileToGithub(path, contentObj, sha, commitMsg) {
    const owner = localStorage.getItem('ghOwner');
    const repo = localStorage.getItem('ghRepo');
    const token = localStorage.getItem('ghToken');
    
    const contentStr = JSON.stringify(contentObj, null, 2);
    const base64Content = btoa(unescape(encodeURIComponent(contentStr)));

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const body = {
      message: commitMsg,
      content: base64Content,
      sha: sha
    };

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) throw new Error("Failed to push to GitHub");
    return await response.json();
  }

  // Upload raw image file to GitHub
  async function uploadImageToGithub(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const base64Data = e.target.result.split(',')[1];
          const jsonPath = `assets/uploads/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
          const githubPath = `${jsonPath}`;
          
          const owner = localStorage.getItem('ghOwner');
          const repo = localStorage.getItem('ghRepo');
          const token = localStorage.getItem('ghToken');
          
          const url = `https://api.github.com/repos/${owner}/${repo}/contents/${githubPath}`;
          const body = {
            message: "Upload image via Admin Panel",
            content: base64Data
          };

          const response = await fetch(url, {
            method: 'PUT',
            headers: {
              'Authorization': `token ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
          });

          if (!response.ok) throw new Error("Failed to upload image to GitHub");
          resolve(jsonPath);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ==============================
  // NEWS LOGIC
  // ==============================
  let newsSha = "";
  let currentNews = [];

  document.getElementById('loadNewsBtn').addEventListener('click', async () => {
    try {
      setStatus('newsStatus', 'Loading from GitHub...', '');
      const res = await fetchFileFromGithub('data/updates.json');
      currentNews = res.content;
      newsSha = res.sha;
      
      document.getElementById('newsEditor').style.display = 'block';
      renderExistingNews();
      setStatus('newsStatus', 'News loaded successfully!', 'success');
    } catch (err) {
      setStatus('newsStatus', err.message, 'error');
    }
  });

  function renderExistingNews() {
    const list = document.getElementById('existingNewsList');
    list.innerHTML = '';
    currentNews.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML = `
        <div class="list-item-content">
          <strong>${item.title}</strong>
          ${item.date ? item.date.split('T')[0] : ''} | ${item.tag || ''}
        </div>
        <div class="list-item-actions">
          <button class="btn-edit" title="Edit this item">✏️</button>
          <button class="btn-delete" title="Delete this item">🗑️</button>
        </div>
      `;
      div.querySelector('.btn-edit').addEventListener('click', () => startEditNews(index));
      div.querySelector('.btn-delete').addEventListener('click', () => deleteNewsItem(index));
      list.appendChild(div);
    });
  }

  async function deleteNewsItem(index) {
    const item = currentNews[index];
    if (!confirm(`Are you sure you want to delete:\n"${item.title}"?`)) return;
    
    try {
      currentNews.splice(index, 1);
      setStatus('newsStatus', 'Deleting & pushing to GitHub...', '');
      const res = await pushFileToGithub('data/updates.json', currentNews, newsSha, `Delete news: ${item.title}`);
      newsSha = res.content.sha;
      renderExistingNews();
      resetNewsForm();
      setStatus('newsStatus', 'Deleted successfully!', 'success');
    } catch (err) {
      setStatus('newsStatus', err.message, 'error');
    }
  }

  function startEditNews(index) {
    const item = currentNews[index];
    document.getElementById('newsEditIndex').value = index;
    document.getElementById('newsTitle').value = item.title || '';
    document.getElementById('newsDate').value = item.date ? item.date.split('T')[0] : '';
    document.getElementById('newsTag').value = item.tag || '';
    document.getElementById('newsTagType').value = item.tagType || 'announcement';
    document.getElementById('newsLink').value = item.link || 'contact.html';
    document.getElementById('newsDesc').value = item.description || '';
    document.getElementById('newsImgFile').value = '';

    document.getElementById('newsFormTitle').textContent = `Editing News: ${item.title}`;
    document.getElementById('pushNewsBtn').textContent = 'Update & Push to GitHub';
    document.getElementById('cancelNewsEditBtn').style.display = 'inline-block';
    document.getElementById('newsFormTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetNewsForm() {
    document.getElementById('newsEditIndex').value = '-1';
    document.getElementById('newsTitle').value = '';
    document.getElementById('newsDate').value = '';
    document.getElementById('newsTag').value = '';
    document.getElementById('newsTagType').value = 'announcement';
    document.getElementById('newsLink').value = 'contact.html';
    document.getElementById('newsDesc').value = '';
    document.getElementById('newsImgFile').value = '';

    document.getElementById('newsFormTitle').textContent = 'Add New Update';
    document.getElementById('pushNewsBtn').textContent = 'Add & Push to GitHub';
    document.getElementById('cancelNewsEditBtn').style.display = 'none';
  }

  document.getElementById('cancelNewsEditBtn').addEventListener('click', resetNewsForm);

  document.getElementById('pushNewsBtn').addEventListener('click', async () => {
    try {
      if (!newsSha) throw new Error("Load news first.");
      
      setStatus('newsStatus', 'Processing...', '');
      
      let imageUrl = "";
      const imgInput = document.getElementById('newsImgFile');
      const editIndex = parseInt(document.getElementById('newsEditIndex').value);

      if (imgInput.files && imgInput.files[0]) {
        setStatus('newsStatus', 'Uploading Image to GitHub...', '');
        imageUrl = await uploadImageToGithub(imgInput.files[0]);
      } else if (editIndex >= 0 && currentNews[editIndex]) {
        imageUrl = currentNews[editIndex].imageUrl || '';
      }

      const updateObj = {
        id: (editIndex >= 0 && currentNews[editIndex]) ? currentNews[editIndex].id : Date.now(),
        title: document.getElementById('newsTitle').value,
        date: document.getElementById('newsDate').value + "T10:00:00Z",
        tag: document.getElementById('newsTag').value,
        tagType: document.getElementById('newsTagType').value,
        description: document.getElementById('newsDesc').value,
        imageUrl: imageUrl,
        link: document.getElementById('newsLink').value
      };

      if (!updateObj.title || !document.getElementById('newsDate').value) {
        throw new Error("Title and Date are required!");
      }

      if (editIndex >= 0) {
        currentNews[editIndex] = updateObj;
      } else {
        currentNews.unshift(updateObj);
      }

      setStatus('newsStatus', 'Pushing JSON to GitHub...', '');
      const res = await pushFileToGithub('data/updates.json', currentNews, newsSha, editIndex >= 0 ? `Update news: ${updateObj.title}` : "Add new news update via Admin Panel");
      newsSha = res.content.sha;
      renderExistingNews();
      resetNewsForm();
      setStatus('newsStatus', 'Successfully published to GitHub!', 'success');
    } catch (err) {
      setStatus('newsStatus', err.message, 'error');
    }
  });


  // ==============================
  // RESULTS LOGIC
  // ==============================
  let resultsSha = "";
  let currentResultsFile = null;

  document.getElementById('loadResultsBtn').addEventListener('click', async () => {
    try {
      setStatus('resultsStatus', 'Loading from GitHub...', '');
      const res = await fetchFileFromGithub('data/results.json');
      currentResultsFile = res.content;
      resultsSha = res.sha;
      
      document.getElementById('resultsEditor').style.display = 'block';
      renderExistingResults();
      setStatus('resultsStatus', 'Results loaded successfully!', 'success');
    } catch (err) {
      setStatus('resultsStatus', err.message, 'error');
    }
  });

  function renderExistingResults() {
    const list = document.getElementById('existingResultsList');
    list.innerHTML = '';
    if (!currentResultsFile || !currentResultsFile.results) return;
    
    currentResultsFile.results.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML = `
        <div class="list-item-content">
          <strong>Date: ${item.date}</strong>
          [Image ID: ${item.id}]
        </div>
        <div class="list-item-actions">
          <button class="btn-edit" title="Edit this item">✏️</button>
          <button class="btn-delete" title="Delete this item">🗑️</button>
        </div>
      `;
      div.querySelector('.btn-edit').addEventListener('click', () => startEditResults(index));
      div.querySelector('.btn-delete').addEventListener('click', () => deleteResultItem(index));
      list.appendChild(div);
    });
  }

  async function deleteResultItem(index) {
    const item = currentResultsFile.results[index];
    if (!confirm(`Are you sure you want to delete this result image from date: ${item.date}?`)) return;
    
    try {
      currentResultsFile.results.splice(index, 1);
      setStatus('resultsStatus', 'Deleting & pushing to GitHub...', '');
      const res = await pushFileToGithub('data/results.json', currentResultsFile, resultsSha, `Delete result on: ${item.date}`);
      resultsSha = res.content.sha;
      renderExistingResults();
      resetResultsForm();
      setStatus('resultsStatus', 'Deleted successfully!', 'success');
    } catch (err) {
      setStatus('resultsStatus', err.message, 'error');
    }
  }

  function startEditResults(index) {
    const item = currentResultsFile.results[index];
    document.getElementById('resultsEditIndex').value = index;
    document.getElementById('resDate').value = item.date || '';
    document.getElementById('resImgFile').value = '';

    document.getElementById('resultsFormTitle').textContent = `Editing Result: ${item.date}`;
    document.getElementById('pushResultsBtn').textContent = 'Update & Push to GitHub';
    document.getElementById('cancelResultsEditBtn').style.display = 'inline-block';
    document.getElementById('resultsFormTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetResultsForm() {
    document.getElementById('resultsEditIndex').value = '-1';
    document.getElementById('resDate').value = '';
    document.getElementById('resImgFile').value = '';

    document.getElementById('resultsFormTitle').textContent = 'Add New Image Result';
    document.getElementById('pushResultsBtn').textContent = 'Add & Push to GitHub';
    document.getElementById('cancelResultsEditBtn').style.display = 'none';
  }

  document.getElementById('cancelResultsEditBtn').addEventListener('click', resetResultsForm);

  document.getElementById('pushResultsBtn').addEventListener('click', async () => {
    try {
      if (!resultsSha) throw new Error("Load results first.");
      
      setStatus('resultsStatus', 'Processing...', '');
      
      let imageUrl = "";
      const imgInput = document.getElementById('resImgFile');
      const editIndex = parseInt(document.getElementById('resultsEditIndex').value);

      if (imgInput.files && imgInput.files[0]) {
        setStatus('resultsStatus', 'Uploading Image to GitHub...', '');
        imageUrl = await uploadImageToGithub(imgInput.files[0]);
      } else if (editIndex >= 0 && currentResultsFile.results[editIndex]) {
        imageUrl = currentResultsFile.results[editIndex].imageUrl || '';
      } else {
        throw new Error("Student Image is required!");
      }

      const dateVal = document.getElementById('resDate').value;
      if (!dateVal) {
        throw new Error("Date is required!");
      }

      const achieverObj = {
        id: (editIndex >= 0 && currentResultsFile.results[editIndex]) ? currentResultsFile.results[editIndex].id : Date.now(),
        date: dateVal,
        imageUrl: imageUrl
      };

      if (editIndex >= 0) {
        currentResultsFile.results[editIndex] = achieverObj;
      } else {
        currentResultsFile.results.unshift(achieverObj);
      }

      setStatus('resultsStatus', 'Pushing JSON to GitHub...', '');
      const res = await pushFileToGithub('data/results.json', currentResultsFile, resultsSha, editIndex >= 0 ? `Update result on: ${dateVal}` : "Add new achiever image via Admin Panel");
      resultsSha = res.content.sha;
      renderExistingResults();
      resetResultsForm();
      setStatus('resultsStatus', 'Successfully published to GitHub!', 'success');
    } catch (err) {
      setStatus('resultsStatus', err.message, 'error');
    }
  });


  // ==============================
  // TICKER LOGIC
  // ==============================
  let tickerSha = "";

  document.getElementById('loadTickerBtn').addEventListener('click', async () => {
    try {
      setStatus('tickerStatus', 'Loading from GitHub...', '');
      const res = await fetchFileFromGithub('data/ticker.json');
      const tickerArray = res.content;
      tickerSha = res.sha;
      
      document.getElementById('tickerEditor').style.display = 'block';
      document.getElementById('tickerTextarea').value = tickerArray.join('\n');
      setStatus('tickerStatus', 'Ticker loaded successfully!', 'success');
    } catch (err) {
      setStatus('tickerStatus', err.message, 'error');
    }
  });

  document.getElementById('pushTickerBtn').addEventListener('click', async () => {
    try {
      if (!tickerSha) throw new Error("Load ticker first.");
      
      const text = document.getElementById('tickerTextarea').value;
      const newArray = text.split('\n').map(l => l.trim()).filter(l => l);

      if (newArray.length === 0) {
        throw new Error("Ticker cannot be empty!");
      }

      setStatus('tickerStatus', 'Pushing to GitHub...', '');

      const res = await pushFileToGithub('data/ticker.json', newArray, tickerSha, "Update dynamic ticker via Admin Panel");
      tickerSha = res.content.sha;
      
      setStatus('tickerStatus', 'Successfully pushed to GitHub!', 'success');
    } catch (err) {
      setStatus('tickerStatus', err.message, 'error');
    }
  });


  // ==============================
  // FACULTY LOGIC
  // ==============================
  let facultySha = "";
  let currentFaculty = [];

  document.getElementById('loadFacultyBtn').addEventListener('click', async () => {
    try {
      setStatus('facultyStatus', 'Loading from GitHub...', '');
      const res = await fetchFileFromGithub('data/faculty.json');
      currentFaculty = res.content;
      facultySha = res.sha;

      document.getElementById('facultyEditor').style.display = 'block';
      renderExistingFaculty();
      setStatus('facultyStatus', 'Faculty loaded successfully!', 'success');
    } catch (err) {
      setStatus('facultyStatus', err.message, 'error');
    }
  });

  function renderExistingFaculty() {
    const list = document.getElementById('existingFacultyList');
    list.innerHTML = '';
    currentFaculty.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML = `
        <div class="list-item-content">
          <strong>${item.emoji || '👨‍🏫'} ${item.name}</strong>
          ${item.role}
        </div>
        <div class="list-item-actions">
          <button class="btn-edit" title="Edit this faculty member">✏️</button>
          <button class="btn-delete" title="Delete this faculty member">🗑️</button>
        </div>
      `;
      div.querySelector('.btn-edit').addEventListener('click', () => startEditFaculty(index));
      div.querySelector('.btn-delete').addEventListener('click', () => deleteFacultyItem(index));
      list.appendChild(div);
    });
  }

  function startEditFaculty(index) {
    const item = currentFaculty[index];
    document.getElementById('facultyEditIndex').value = index;
    document.getElementById('facultyName').value = item.name || '';
    document.getElementById('facultyRole').value = item.role || '';
    document.getElementById('facultyEmoji').value = item.emoji || '👨‍🏫';
    document.getElementById('facultyDesc').value = item.description || '';
    document.getElementById('facultyImgFile').value = '';

    // Update UI to show edit mode
    document.getElementById('facultyFormTitle').textContent = `Editing: ${item.name}`;
    document.getElementById('pushFacultyBtn').textContent = 'Update & Push to GitHub';
    document.getElementById('cancelFacultyEditBtn').style.display = 'inline-block';

    // Scroll to form
    document.getElementById('facultyFormTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetFacultyForm() {
    document.getElementById('facultyEditIndex').value = '-1';
    document.getElementById('facultyName').value = '';
    document.getElementById('facultyRole').value = '';
    document.getElementById('facultyEmoji').value = '👨‍🏫';
    document.getElementById('facultyDesc').value = '';
    document.getElementById('facultyImgFile').value = '';

    document.getElementById('facultyFormTitle').textContent = 'Add New Faculty Member';
    document.getElementById('pushFacultyBtn').textContent = 'Add & Push to GitHub';
    document.getElementById('cancelFacultyEditBtn').style.display = 'none';
  }

  document.getElementById('cancelFacultyEditBtn').addEventListener('click', resetFacultyForm);

  async function deleteFacultyItem(index) {
    const item = currentFaculty[index];
    if (!confirm(`Are you sure you want to delete:\n"${item.name}"?`)) return;

    try {
      currentFaculty.splice(index, 1);
      setStatus('facultyStatus', 'Deleting & pushing to GitHub...', '');
      const res = await pushFileToGithub('data/faculty.json', currentFaculty, facultySha, `Delete faculty: ${item.name}`);
      facultySha = res.content.sha;
      renderExistingFaculty();
      resetFacultyForm();
      setStatus('facultyStatus', 'Deleted successfully!', 'success');
    } catch (err) {
      setStatus('facultyStatus', err.message, 'error');
    }
  }

  document.getElementById('pushFacultyBtn').addEventListener('click', async () => {
    try {
      if (!facultySha) throw new Error("Load faculty first.");

      const name = document.getElementById('facultyName').value.trim();
      const role = document.getElementById('facultyRole').value.trim();
      const emoji = document.getElementById('facultyEmoji').value.trim() || '👨‍🏫';
      const description = document.getElementById('facultyDesc').value.trim();
      const editIndex = parseInt(document.getElementById('facultyEditIndex').value);

      if (!name || !role) {
        throw new Error("Name and Role are required!");
      }

      setStatus('facultyStatus', 'Processing...', '');

      // Handle optional image upload
      let imageUrl = "";
      const imgInput = document.getElementById('facultyImgFile');
      if (imgInput.files && imgInput.files[0]) {
        setStatus('facultyStatus', 'Uploading Image to GitHub...', '');
        imageUrl = await uploadImageToGithub(imgInput.files[0]);
      } else if (editIndex >= 0 && currentFaculty[editIndex]) {
        // Keep existing image if no new one uploaded during edit
        imageUrl = currentFaculty[editIndex].imageUrl || '';
      }

      if (editIndex >= 0 && currentFaculty[editIndex]) {
        // UPDATE existing faculty member
        currentFaculty[editIndex].name = name;
        currentFaculty[editIndex].role = role;
        currentFaculty[editIndex].emoji = emoji;
        currentFaculty[editIndex].description = description;
        currentFaculty[editIndex].imageUrl = imageUrl;

        setStatus('facultyStatus', 'Pushing update to GitHub...', '');
        const res = await pushFileToGithub('data/faculty.json', currentFaculty, facultySha, `Update faculty: ${name}`);
        facultySha = res.content.sha;
        renderExistingFaculty();
        resetFacultyForm();
        setStatus('facultyStatus', 'Faculty updated successfully!', 'success');
      } else {
        // ADD new faculty member
        const newFaculty = {
          id: Date.now(),
          name: name,
          role: role,
          description: description,
          emoji: emoji,
          imageUrl: imageUrl
        };

        currentFaculty.push(newFaculty);
        setStatus('facultyStatus', 'Pushing JSON to GitHub...', '');
        const res = await pushFileToGithub('data/faculty.json', currentFaculty, facultySha, `Add faculty: ${name}`);
        facultySha = res.content.sha;
        renderExistingFaculty();
        resetFacultyForm();
        setStatus('facultyStatus', 'Faculty added successfully!', 'success');
      }

    } catch (err) {
      setStatus('facultyStatus', err.message, 'error');
    }
  });

  // ==============================
  // COURSE LOGIC
  // ==============================
  let coursesSha = "";
  let currentCourses = [];

  document.getElementById('loadCoursesBtn').addEventListener('click', async () => {
    try {
      setStatus('coursesStatus', 'Loading from GitHub...', '');
      const res = await fetchFileFromGithub('data/courses.json');
      currentCourses = res.content;
      coursesSha = res.sha;

      document.getElementById('coursesEditor').style.display = 'block';
      renderExistingCourses();
      setStatus('coursesStatus', 'Courses loaded successfully!', 'success');
    } catch (err) {
      setStatus('coursesStatus', err.message, 'error');
    }
  });

  function renderExistingCourses() {
    const list = document.getElementById('existingCoursesList');
    list.innerHTML = '';
    currentCourses.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML = `
        <div class="list-item-content">
          <strong>${item.tag}</strong>
          <span class="muted">${item.branch.toUpperCase()} — ${item.script}</span>
        </div>
        <div class="list-item-actions">
          <button class="btn-edit" title="Edit this program">✏️</button>
        </div>
      `;
      div.querySelector('.btn-edit').addEventListener('click', () => startEditCourse(index));
      list.appendChild(div);
    });
  }

  function startEditCourse(index) {
    const item = currentCourses[index];
    document.getElementById('courseEditIndex').value = index;
    document.getElementById('courseTag').value = item.tag || '';
    document.getElementById('courseTitle').value = item.title || '';
    document.getElementById('courseScript').value = item.script || '';
    document.getElementById('courseDesc').value = item.description || '';
    document.getElementById('courseSubjects').value = (item.subjects || []).join('\n');

    document.getElementById('courseFormTitle').textContent = `Editing: ${item.tag}`;
    document.getElementById('cancelCourseEditBtn').style.display = 'inline-block';
    document.getElementById('courseFormTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetCourseForm() {
    document.getElementById('courseEditIndex').value = '-1';
    document.getElementById('courseTag').value = '';
    document.getElementById('courseTitle').value = '';
    document.getElementById('courseScript').value = '';
    document.getElementById('courseDesc').value = '';
    document.getElementById('courseSubjects').value = '';

    document.getElementById('courseFormTitle').textContent = 'Edit Program Card';
    document.getElementById('cancelCourseEditBtn').style.display = 'none';
  }

  document.getElementById('cancelCourseEditBtn').addEventListener('click', resetCourseForm);

  document.getElementById('pushCoursesBtn').addEventListener('click', async () => {
    try {
      if (!coursesSha) throw new Error("Load course data first.");

      const editIndex = parseInt(document.getElementById('courseEditIndex').value);
      if (editIndex < 0) throw new Error("Select a program from the list below to edit.");

      const tag = document.getElementById('courseTag').value.trim();
      const title = document.getElementById('courseTitle').value.trim();
      const script = document.getElementById('courseScript').value.trim();
      const description = document.getElementById('courseDesc').value.trim();
      const subjectsRaw = document.getElementById('courseSubjects').value;
      const subjects = subjectsRaw.split('\n').map(s => s.trim()).filter(s => s);

      if (!tag || !title || !script) {
        throw new Error("Tag, Title, and Classes are required!");
      }

      setStatus('coursesStatus', 'Processing...', '');

      // UPDATE existing course (ONLY TEXT FIELDS)
      currentCourses[editIndex].tag = tag;
      currentCourses[editIndex].title = title;
      currentCourses[editIndex].script = script;
      currentCourses[editIndex].description = description;
      currentCourses[editIndex].subjects = subjects;

      setStatus('coursesStatus', 'Pushing update to GitHub...', '');
      const res = await pushFileToGithub('data/courses.json', currentCourses, coursesSha, `Update course program: ${tag}`);
      coursesSha = res.content.sha;
      renderExistingCourses();
      resetCourseForm();
      setStatus('coursesStatus', 'Course updated successfully!', 'success');

    } catch (err) {
      setStatus('coursesStatus', err.message, 'error');
    }
  });

  // ══════════════════════════════════════════
  // CAMPUS GALLERY MANAGEMENT
  // ══════════════════════════════════════════
  const MAX_GALLERY_PHOTOS = 40;
  let galleryData = { photos: [] };
  let gallerySha = null;

  function updateGalleryCountUI() {
    const count = galleryData.photos.length;
    const remaining = MAX_GALLERY_PHOTOS - count;
    document.getElementById('galleryPhotoCount').textContent = `(${count} / ${MAX_GALLERY_PHOTOS})`;
    document.getElementById('galleryCountMsg').textContent =
      remaining > 0
        ? `You have ${remaining} photo slot(s) remaining out of ${MAX_GALLERY_PHOTOS} max.`
        : `⚠️ Maximum of ${MAX_GALLERY_PHOTOS} photos reached. Delete old ones to add new.`;
    document.getElementById('pushGalleryBtn').disabled = remaining <= 0;
  }

  function renderExistingGallery() {
    const list = document.getElementById('existingGalleryList');
    list.innerHTML = '';
    if (!galleryData.photos.length) {
      list.innerHTML = '<p class="muted">No photos yet.</p>';
      return;
    }
    galleryData.photos.forEach((photo, index) => {
      const card = document.createElement('div');
      card.style.cssText = 'background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; position:relative;';

      const img = document.createElement('img');
      img.src = photo.imageUrl.startsWith('http')
        ? photo.imageUrl
        : `https://raw.githubusercontent.com/${localStorage.getItem('ghOwner')}/${localStorage.getItem('ghRepo')}/main/${photo.imageUrl}`;
      img.alt = photo.caption || 'Campus Photo';
      img.style.cssText = 'width:100%; height:120px; object-fit:cover; display:block;';
      img.onerror = () => { img.src = ''; img.style.background = '#e2e8f0'; };

      const info = document.createElement('div');
      info.style.cssText = 'padding:8px; font-size:12px; color:#475569;';
      info.textContent = photo.caption || 'Campus Life';

      const delBtn = document.createElement('button');
      delBtn.textContent = '🗑️ Delete';
      delBtn.style.cssText = 'width:100%; background:#fee2e2; color:#dc2626; border:none; padding:6px; font-size:12px; font-weight:600; cursor:pointer; border-top:1px solid #fecaca;';
      delBtn.addEventListener('click', () => deleteGalleryPhoto(index));

      card.appendChild(img);
      card.appendChild(info);
      card.appendChild(delBtn);
      list.appendChild(card);
    });
    updateGalleryCountUI();
  }

  document.getElementById('loadGalleryBtn').addEventListener('click', async () => {
    setStatus('galleryStatus', 'Loading...', 'success');
    try {
      const result = await fetchFileFromGithub('data/gallery.json');
      galleryData = result.content;
      gallerySha = result.sha;
      document.getElementById('galleryEditor').style.display = 'block';
      renderExistingGallery();
      setStatus('galleryStatus', 'Loaded!', 'success');
    } catch (err) {
      // If file doesn't exist yet, start fresh
      galleryData = { photos: [] };
      gallerySha = null;
      document.getElementById('galleryEditor').style.display = 'block';
      renderExistingGallery();
      setStatus('galleryStatus', 'Starting fresh (no file found yet)', 'success');
    }
  });

  document.getElementById('pushGalleryBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('galleryImgFile');
    const caption = document.getElementById('galleryCaption').value.trim() || 'Campus Life';

    if (!fileInput.files[0]) {
      setStatus('galleryStatus', 'Please select a photo to upload.', 'error');
      return;
    }

    if (galleryData.photos.length >= MAX_GALLERY_PHOTOS) {
      setStatus('galleryStatus', `Max ${MAX_GALLERY_PHOTOS} photos reached. Delete some first.`, 'error');
      return;
    }

    setStatus('galleryStatus', 'Uploading photo...', 'success');
    document.getElementById('pushGalleryBtn').disabled = true;

    try {
      const file = fileInput.files[0];
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const base64Data = e.target.result.split(',')[1];
          const safeFileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
          const imagePath = `assets/gallery/${safeFileName}`;

          const owner = localStorage.getItem('ghOwner');
          const repo = localStorage.getItem('ghRepo');
          const token = localStorage.getItem('ghToken');

          // Step 1: Upload the image file
          const imgRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${imagePath}`, {
            method: 'PUT',
            headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: `Add campus gallery photo: ${safeFileName}`, content: base64Data })
          });
          if (!imgRes.ok) throw new Error('Image upload to GitHub failed.');

          // Step 2: Update gallery.json with new entry
          const newId = Date.now();
          galleryData.photos.push({ id: newId, imageUrl: imagePath, caption });

          // Step 3: Push updated gallery.json
          const body = {
            message: `Add gallery photo: ${caption}`,
            content: btoa(unescape(encodeURIComponent(JSON.stringify(galleryData, null, 2)))),
          };
          if (gallerySha) body.sha = gallerySha;

          const jsonRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/data/gallery.json`, {
            method: 'PUT',
            headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          if (!jsonRes.ok) throw new Error('Failed to update gallery.json on GitHub.');

          const jsonResult = await jsonRes.json();
          gallerySha = jsonResult.content.sha;

          fileInput.value = '';
          document.getElementById('galleryCaption').value = '';
          renderExistingGallery();
          setStatus('galleryStatus', '✅ Photo uploaded & gallery updated!', 'success');
        } catch (err) {
          setStatus('galleryStatus', err.message, 'error');
        } finally {
          document.getElementById('pushGalleryBtn').disabled = false;
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setStatus('galleryStatus', err.message, 'error');
      document.getElementById('pushGalleryBtn').disabled = false;
    }
  });

  async function deleteGalleryPhoto(index) {
    if (!confirm('Delete this photo from the gallery?')) return;

    const owner = localStorage.getItem('ghOwner');
    const repo = localStorage.getItem('ghRepo');
    const token = localStorage.getItem('ghToken');

    setStatus('galleryStatus', 'Deleting...', 'success');

    try {
      galleryData.photos.splice(index, 1);

      const body = {
        message: 'Remove campus gallery photo',
        content: btoa(unescape(encodeURIComponent(JSON.stringify(galleryData, null, 2)))),
      };
      if (gallerySha) body.sha = gallerySha;

      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/data/gallery.json`, {
        method: 'PUT',
        headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('Failed to update gallery.json on GitHub.');

      const result = await res.json();
      gallerySha = result.content.sha;

      renderExistingGallery();
      setStatus('galleryStatus', '🗑️ Photo removed from gallery.', 'success');
    } catch (err) {
      setStatus('galleryStatus', err.message, 'error');
    }
  }

});
