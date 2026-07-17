// Inicializar iconos de Lucide
lucide.createIcons();

// Estado de la aplicación
let animals = [];
try {
    const saved = localStorage.getItem('senasa_animals');
    if (saved) {
        animals = JSON.parse(saved);
    }
} catch (e) {
    console.error('Error al cargar animales guardados', e);
}

function saveAnimals() {
    localStorage.setItem('senasa_animals', JSON.stringify(animals));
}

// Elementos del DOM
const scannerInput = document.getElementById('scannerInput');
const errorMessage = document.getElementById('errorMessage');
const sexSelect = document.getElementById('sexSelect');
const breedSelect = document.getElementById('breedSelect');
const dateInput = document.getElementById('dateInput');

const totalCount = document.getElementById('totalCount');
const tableTitleCount = document.getElementById('tableTitleCount');
const btnClearList = document.getElementById('btnClearList');
const emptyState = document.getElementById('emptyState');
const animalsTable = document.getElementById('animalsTable');
const tableBody = document.getElementById('tableBody');

const btnExportTxt = document.getElementById('btnExportTxt');
const btnExportExcel = document.getElementById('btnExportExcel');

// Inicializar fecha por defecto (MM/YYYY)
const today = new Date();
dateInput.value = `${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

// Actualizar UI inicial (por si se cargaron datos guardados)
updateUI();

// Función para devolver el foco al escáner
function refocusScanner() {
    scannerInput.focus();
    scannerInput.select();
}

// Al cambiar cualquier configuración, devolver el foco inmediatamente al escáner
sexSelect.addEventListener('change', refocusScanner);
breedSelect.addEventListener('change', refocusScanner);
dateInput.addEventListener('change', refocusScanner);

// Mantener el foco en el escáner (a menos que se cliquee en un select o input)
document.addEventListener('click', (e) => {
    setTimeout(() => {
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        if (activeTag !== 'SELECT' && activeTag !== 'BUTTON' && activeTag !== 'INPUT') {
            refocusScanner();
        }
    }, 100);
});

// Manejar lectura del escáner
scannerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const code = scannerInput.value.trim();

        // Validación 15 dígitos numéricos
        if (code.length !== 15 || !/^\d+$/.test(code)) {
            showError('Error: La caravana debe tener exactamente 15 dígitos numéricos.');
            scannerInput.select();
            return;
        }

        // Evitar duplicados en el mismo lote
        if (animals.some(a => a.id === code)) {
            showError('Error: Esta caravana ya fue escaneada en este lote.');
            scannerInput.select();
            return;
        }

        // Agregar nuevo animal
        const newAnimal = {
            id: code,
            sex: sexSelect.value,
            breed: breedSelect.value,
            birthDate: dateInput.value || '00/0000',
            timestamp: Date.now()
        };

        // Insertar al inicio (más recientes arriba)
        animals.unshift(newAnimal);
        saveAnimals();

        scannerInput.select();
        hideError();
        updateUI();
    }
});

// Funciones de UI
function showError(msg) {
    errorMessage.textContent = msg;
    errorMessage.classList.remove('hidden');
}

function hideError() {
    errorMessage.classList.add('hidden');
}

function updateUI() {
    // Actualizar contadores
    totalCount.textContent = animals.length;
    tableTitleCount.textContent = animals.length;

    // Mostrar/ocultar estados vacíos y botones
    if (animals.length === 0) {
        emptyState.classList.remove('hidden');
        animalsTable.classList.add('hidden');
        btnClearList.classList.add('hidden');
        btnExportTxt.disabled = true;
        btnExportExcel.disabled = true;
    } else {
        emptyState.classList.add('hidden');
        animalsTable.classList.remove('hidden');
        btnClearList.classList.remove('hidden');
        btnExportTxt.disabled = false;
        btnExportExcel.disabled = false;
    }

    // Renderizar tabla
    renderTable();
}

function renderTable() {
    tableBody.innerHTML = '';

    animals.forEach((animal, index) => {
        const tr = document.createElement('tr');

        // Numeración inversa (el más reciente arriba)
        const num = animals.length - index;

        tr.innerHTML = `
            <td>${num}</td>
            <td class="font-medium text-accent">${animal.id}</td>
            <td>${animal.sex}</td>
            <td>${animal.breed}</td>
            <td>${animal.birthDate}</td>
            <td>
                <button class="btn-icon text-danger" onclick="removeAnimal('${animal.id}')" title="Eliminar del lote">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
        `;
        tableBody.appendChild(tr);
    });

    // Refrescar iconos para los elementos nuevos
    lucide.createIcons();
}

// Hacer global la función para que el botón pueda llamarla
window.removeAnimal = function (id) {
    animals = animals.filter(a => a.id !== id);
    saveAnimals();
    updateUI();
};

btnClearList.addEventListener('click', () => {
    if (confirm('¿Estás seguro de que quieres borrar toda la lista actual?')) {
        animals = [];
        saveAnimals();
        updateUI();
    }
});

// Exportaciones
btnExportTxt.addEventListener('click', () => {
    if (animals.length === 0) return;

    // Formato SENASA: CARAVANA-SEXO-RAZA-MM/YYYY;
    // Como queremos exportar del más viejo al más nuevo (o viceversa), respetamos el orden en que lo mostramos (o lo invertimos si es necesario).
    // Exportaremos tal cual (último escaneado primero) o invertido (primer escaneado primero). Usualmente es mejor el orden de escaneo.
    // animals está ordenado: [reciente, más viejo]
    const sortedAnimals = [...animals].reverse();

    const txtContent = sortedAnimals.map(a => `${a.id}-${a.sex}-${a.breed}-${a.birthDate};`).join('\n');

    const blob = new Blob([txtContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SENASA_Lote_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
});

btnExportExcel.addEventListener('click', () => {
    if (animals.length === 0 || !window.XLSX) return;

    const sortedAnimals = [...animals].reverse();

    const data = sortedAnimals.map(a => ({
        'Caravana': a.id,
        'Sexo': a.sex === 'M' ? 'Macho' : 'Hembra',
        'Raza': a.breed,
        'Fecha Nacimiento': a.birthDate
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ventas");
    XLSX.writeFile(wb, `Registro_Ventas_${new Date().toISOString().split('T')[0]}.xlsx`);
});
