const fs = require('fs');
const path = require('path');

// Используем legacy build для Node.js
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf');

// Настройка worker
pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(__dirname, '../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.js');

const pdfPath = process.argv[2];

if (!pdfPath) {
  console.error('Usage: node  <pathtopdf> - read-pdf.js:13');
  process.exit(1);
}

async function extractText() {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    // Конвертируем Buffer в Uint8Array для pdfjs
    const data = new Uint8Array(dataBuffer);
    const loadingTask = pdfjsLib.getDocument({ data: data });
    const pdf = await loadingTask.promise;
    
    console.log('=== PDF METADATA === - read-pdf.js:23');
    console.log(`Pages: ${pdf.numPages} - read-pdf.js:24`);
    console.log('');
    console.log('=== PDF CONTENT === - read-pdf.js:26');
    
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      console.log(`\n Page ${i} \n - read-pdf.js:30`);
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
      console.log(pageText);
    }
    
    console.log('\n=== FULL TEXT === - read-pdf.js:38');
    console.log(fullText);
  } catch (error) {
    console.error('Error reading PDF: - read-pdf.js:41', error.message);
    process.exit(1);
  }
}

extractText();
