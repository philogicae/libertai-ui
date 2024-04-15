import { createUploaderComponent } from 'quasar';
import { computed, ref } from 'vue';

// State
import { useKnowledgeStore } from 'src/stores/knowledge-store';

// Get PDF.js from the window object
const pdfjsLib = window.pdfjsLib;

export default createUploaderComponent({
  name: 'KnowledgeStoreUploader',
  props: {},
  emits: [],
  injectPlugin({ _props, _emit, helpers }) {
    const loading = ref(false);

    // Map of file objects to their status as either 'queued', 'uploading', 'embedding', 'uploaded', or 'failed'
    const fileStatus = ref({});

    // Upload Logic
    async function upload(_args) {
      // Set the loading state
      loading.value = true;
      const files = helpers.queuedFiles.value;
      console.log(`components::KnowledgeStoreUploader::upload - files: ${files}`);
      fileStatus.value = {};
      fileStatus.value = files.reduce((acc, file) => {
        acc[file.name] = 'queued';
        return acc;
      });

      // Load our state
      const knowledgeStore = useKnowledgeStore();

      let uploads = [];
      // TODO: workers would be preferred here
      // Handle Each File in Sequence
      for (let file of files) {
        let result = async () => {
          try {
            fileStatus.value[file.name] = 'uploading';
            helpers.updateFileStatus(file, 'uploading');
            let { title, text } = await processFile(file);
            fileStatus.value[file.name] = 'embedding';
            helpers.updateFileStatus(file, 'embedding');
            await knowledgeStore.addDocument(title, text);
            fileStatus.value[file.name] = 'uploaded';
            helpers.updateFileStatus(file, 'uploaded');
          } catch (error) {
            console.error(error);
            fileStatus.value[file.name] = 'failed';
            helpers.updateFileStatus(file, 'failed');
            console.error(`components::KnowledgeStoreUploader::upload - error: ${error}`);
          }
        };
        uploads.push(result());
      }
      // Resolve all uploads
      await Promise.all(uploads);
      // Reset the loading state
      loading.value = false;
    }

    const isUploading = computed(() => {
      // return <Boolean>
      return loading.value;
    });

    const isBusy = computed(() => {
      // return <Boolean>
      return loading.value;
    });

    function abort() {
      fileStatus.value = {};
    }

    /**
     * Extract title and text content from a file.
     * Supports PDF and plain text files.
     * @param {File} file - The file to process.
     * @returns {Promise<{ title: string; text: string }>} - The extracted title and text content.
     */
    async function processFile(file) {
      const title = file.name;
      let extractedText = '';

      try {
        switch (file.type) {
          case 'application/pdf':
            extractedText = await extractTextFromPdfFile(file);
            break;
          case 'text/plain':
            extractedText = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (event) => resolve(event.target.result);
              reader.onerror = (error) => reject(error);
              reader.readAsText(file);
            });
            break;
          default:
            throw new Error(`Unsupported file type: ${file.type}`);
        }
      } catch (error) {
        console.error('Error processing file:', error);
        throw error;
      }

      return { title, text: extractedText };
    }

    /**
     * Extract text from a PDF file
     * @param {File} file
     * @returns {Promise<string>}
     */
    async function extractTextFromPdfFile(file) {
      const pdfUrl = URL.createObjectURL(file);

      let pdf;
      try {
        pdf = await pdfjsLib.getDocument(pdfUrl).promise;
      } catch (error) {
        console.error(`components::KnowledgeStoreUploader::extractTextFromPdfFile - error: ${error}`);
        throw new Error('Failed to extract text from PDF');
      }
      const maxPages = pdf.numPages;
      let textContent = [];

      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageTextContent = content.items.map((item) => item.str).join(' ');
        textContent.push(pageTextContent);
      }
      return textContent.join('');
    }

    return {
      isUploading,
      isBusy,
      abort,
      upload,
    };
  },
});
