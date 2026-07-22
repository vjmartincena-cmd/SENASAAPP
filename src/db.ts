import { dbFirestore } from './firebaseConfig';
import { 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  collection, 
  query, 
  where,
  writeBatch 
} from 'firebase/firestore';
import { User } from 'firebase/auth';

export interface Animal {
  id: string; // RFID
  sex: string;
  breed: string;
  color: string;
  renspa: string;
  birthDate: string; // MM/YYYY
  createdAt: number;
  reportedToSenasa: boolean;
}

export type NovedadType = 'Sanidad' | 'IA' | 'Tacto';

export interface NovedadBase {
  id: string; // uuid
  animalId: string;
  date: string; // YYYY-MM-DD
  type: NovedadType;
  timestamp: number;
  sessionId?: string; // ID de la sesión a la que pertenece
  rodeo?: string; // Etiqueta opcional del rodeo activo durante el escaneo
}

export interface NovedadSanidad extends NovedadBase {
  type: 'Sanidad';
  tubeNumber: number; // Numero de orden dentro de la sesión
}

export interface NovedadIA extends NovedadBase {
  type: 'IA';
  bull: string;
}

export interface NovedadTacto extends NovedadBase {
  type: 'Tacto';
  result: 'Preñada IA' | 'Preñada Repaso' | 'Vacía' | 'Rechazo';
  observation: string;
}

export type Novedad = NovedadSanidad | NovedadIA | NovedadTacto;

// ─── SESIÓN ────────────────────────────────────────────────────────────────
export interface Sesion {
  id: string;          // uuid
  type: NovedadType;   // Sanidad | IA | Tacto
  date: string;        // YYYY-MM-DD
  startedAt: number;   // timestamp
  count: number;       // cantidad de registros en esta sesión
  label?: string;      // etiqueta opcional (ej. "Mañana", "Tarde")
}

export interface AppConfig {
  id: string; // always 'main'
  colors: string[];
  bulls: string[];
  renspas: string[];
  lastTubeNumber: number; // To keep track of the sequence for the current day
  lastTubeDate: string; // To reset tube number on a new day
}

const DB_NAME = 'SenasaCriaDB';
const DB_VERSION = 2; // bumped to add 'sesiones' store + sessionId index

export class Database {
  private db: IDBDatabase | null = null;
  private currentUser: User | null = null;

  setCurrentUser(user: User | null) {
    this.currentUser = user;
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains('animals')) {
          db.createObjectStore('animals', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('novedades')) {
          const novOS = db.createObjectStore('novedades', { keyPath: 'id' });
          novOS.createIndex('animalId', 'animalId', { unique: false });
          novOS.createIndex('type', 'type', { unique: false });
          novOS.createIndex('date', 'date', { unique: false });
          novOS.createIndex('sessionId', 'sessionId', { unique: false });
        } else {
          // Upgrade: add sessionId index if not present
          const tx = (e.target as IDBOpenDBRequest).transaction!;
          const novOS = tx.objectStore('novedades');
          if (!novOS.indexNames.contains('sessionId')) {
            novOS.createIndex('sessionId', 'sessionId', { unique: false });
          }
        }

        if (!db.objectStoreNames.contains('config')) {
          db.createObjectStore('config', { keyPath: 'id' });
        }

        // NEW in v2: sesiones store
        if (!db.objectStoreNames.contains('sesiones')) {
          const sesOS = db.createObjectStore('sesiones', { keyPath: 'id' });
          sesOS.createIndex('type', 'type', { unique: false });
          sesOS.createIndex('date', 'date', { unique: false });
          sesOS.createIndex('startedAt', 'startedAt', { unique: false });
        }
      };
    });
  }

  private getStore(storeName: string, mode: IDBTransactionMode): IDBObjectStore {
    if (!this.db) throw new Error('DB not initialized');
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  // --- FIRESTORE PATH HELPERS ---
  private getAnimalDoc(userId: string, animalId: string) {
    return doc(dbFirestore, 'users', userId, 'animals', animalId);
  }
  private getAnimalsColl(userId: string) {
    return collection(dbFirestore, 'users', userId, 'animals');
  }
  private getNovedadDoc(userId: string, novedadId: string) {
    return doc(dbFirestore, 'users', userId, 'novedades', novedadId);
  }
  private getNovedadesColl(userId: string) {
    return collection(dbFirestore, 'users', userId, 'novedades');
  }
  private getSesionDoc(userId: string, sesionId: string) {
    return doc(dbFirestore, 'users', userId, 'sesiones', sesionId);
  }
  private getSesionesColl(userId: string) {
    return collection(dbFirestore, 'users', userId, 'sesiones');
  }
  private getConfigDoc(userId: string) {
    return doc(dbFirestore, 'users', userId, 'config', 'main');
  }

  // --- CONFIG ---
  async getConfig(): Promise<AppConfig> {
    if (this.currentUser) {
      const docRef = this.getConfigDoc(this.currentUser.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const conf = docSnap.data() as AppConfig;
        if (!conf.renspas) {
          conf.renspas = ['032010037431649'];
        } else if (!conf.renspas.includes('032010037431649')) {
          conf.renspas = ['032010037431649', ...conf.renspas];
        }
        return conf;
      } else {
        const defaultConf = { id: 'main', colors: ['Negro', 'Colorado', 'Pampa'], bulls: ['Toro 1'], renspas: ['032010037431649', 'Cena Pablo', 'Los Alejandros S.A.'], lastTubeNumber: 0, lastTubeDate: '' };
        await setDoc(docRef, defaultConf);
        return defaultConf;
      }
    }

    return new Promise((resolve, reject) => {
      const store = this.getStore('config', 'readonly');
      const req = store.get('main');
      req.onsuccess = () => {
        if (req.result) {
          const conf = req.result;
          if (!conf.renspas) {
            conf.renspas = ['032010037431649'];
          } else if (!conf.renspas.includes('032010037431649')) {
            conf.renspas = ['032010037431649', ...conf.renspas];
          }
          resolve(conf);
        } else {
          resolve({ id: 'main', colors: ['Negro', 'Colorado', 'Pampa'], bulls: ['Toro 1'], renspas: ['032010037431649', 'Cena Pablo', 'Los Alejandros S.A.'], lastTubeNumber: 0, lastTubeDate: '' });
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async saveConfig(config: AppConfig): Promise<void> {
    if (this.currentUser) {
      const docRef = this.getConfigDoc(this.currentUser.uid);
      await setDoc(docRef, config);
      return;
    }

    return new Promise((resolve, reject) => {
      const store = this.getStore('config', 'readwrite');
      const req = store.put(config);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // --- ANIMALS ---
  async saveAnimal(animal: Animal): Promise<void> {
    if (this.currentUser) {
      const docRef = this.getAnimalDoc(this.currentUser.uid, animal.id);
      await setDoc(docRef, animal);
      return;
    }

    return new Promise((resolve, reject) => {
      const store = this.getStore('animals', 'readwrite');
      const req = store.put(animal);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getAnimal(id: string): Promise<Animal | undefined> {
    if (this.currentUser) {
      const docRef = this.getAnimalDoc(this.currentUser.uid, id);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? (docSnap.data() as Animal) : undefined;
    }

    return new Promise((resolve, reject) => {
      const store = this.getStore('animals', 'readonly');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllAnimals(): Promise<Animal[]> {
    if (this.currentUser) {
      const collRef = this.getAnimalsColl(this.currentUser.uid);
      const querySnapshot = await getDocs(collRef);
      const list: Animal[] = [];
      querySnapshot.forEach((d) => list.push(d.data() as Animal));
      return list;
    }

    return new Promise((resolve, reject) => {
      const store = this.getStore('animals', 'readonly');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteAnimal(id: string): Promise<void> {
    if (this.currentUser) {
      const docRef = this.getAnimalDoc(this.currentUser.uid, id);
      await deleteDoc(docRef);
      return;
    }

    return new Promise((resolve, reject) => {
      const store = this.getStore('animals', 'readwrite');
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async replaceAnimalId(oldId: string, newId: string): Promise<void> {
    const oldAnimal = await this.getAnimal(oldId);
    if (!oldAnimal) {
      throw new Error('El ID original no existe.');
    }
    const existingNew = await this.getAnimal(newId);
    if (existingNew) {
      throw new Error('El nuevo ID ya está registrado.');
    }

    const novedades = await this.getNovedadesByAnimal(oldId);
    const newAnimal = { ...oldAnimal, id: newId };

    if (this.currentUser) {
      const batch = writeBatch(dbFirestore);
      batch.set(this.getAnimalDoc(this.currentUser.uid, newId), newAnimal);
      batch.delete(this.getAnimalDoc(this.currentUser.uid, oldId));
      for (const nov of novedades) {
        const updatedNov = { ...nov, animalId: newId };
        batch.set(this.getNovedadDoc(this.currentUser.uid, nov.id), updatedNov);
      }
      await batch.commit();
      return;
    }

    return new Promise<void>((resolve, reject) => {
      if (!this.db) return reject(new Error('DB not initialized'));
      const tx = this.db.transaction(['animals', 'novedades'], 'readwrite');
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      
      const animalStore = tx.objectStore('animals');
      const novStore = tx.objectStore('novedades');

      animalStore.put(newAnimal);
      animalStore.delete(oldId);

      for (const nov of novedades) {
        const updatedNov = { ...nov, animalId: newId };
        novStore.put(updatedNov);
      }
    });
  }

  // --- NOVEDADES ---
  async saveNovedad(novedad: Novedad): Promise<void> {
    if (this.currentUser) {
      const docRef = this.getNovedadDoc(this.currentUser.uid, novedad.id);
      await setDoc(docRef, novedad);
      return;
    }

    return new Promise((resolve, reject) => {
      const store = this.getStore('novedades', 'readwrite');
      const req = store.put(novedad);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getNovedadesByAnimal(animalId: string): Promise<Novedad[]> {
    if (this.currentUser) {
      const collRef = this.getNovedadesColl(this.currentUser.uid);
      const q = query(collRef, where('animalId', '==', animalId));
      const querySnapshot = await getDocs(q);
      const list: Novedad[] = [];
      querySnapshot.forEach((d) => list.push(d.data() as Novedad));
      return list;
    }

    return new Promise((resolve, reject) => {
      const store = this.getStore('novedades', 'readonly');
      const index = store.index('animalId');
      const req = index.getAll(animalId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async getNovedadesBySession(sessionId: string): Promise<Novedad[]> {
    if (this.currentUser) {
      const collRef = this.getNovedadesColl(this.currentUser.uid);
      const q = query(collRef, where('sessionId', '==', sessionId));
      const querySnapshot = await getDocs(q);
      const list: Novedad[] = [];
      querySnapshot.forEach((d) => list.push(d.data() as Novedad));
      return list;
    }

    return new Promise((resolve, reject) => {
      const store = this.getStore('novedades', 'readonly');
      const index = store.index('sessionId');
      const req = index.getAll(sessionId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllNovedades(): Promise<Novedad[]> {
    if (this.currentUser) {
      const collRef = this.getNovedadesColl(this.currentUser.uid);
      const querySnapshot = await getDocs(collRef);
      const list: Novedad[] = [];
      querySnapshot.forEach((d) => list.push(d.data() as Novedad));
      return list;
    }

    return new Promise((resolve, reject) => {
      const store = this.getStore('novedades', 'readonly');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  // --- SESIONES ---
  async saveSesion(sesion: Sesion): Promise<void> {
    if (this.currentUser) {
      const docRef = this.getSesionDoc(this.currentUser.uid, sesion.id);
      await setDoc(docRef, sesion);
      return;
    }

    return new Promise((resolve, reject) => {
      const store = this.getStore('sesiones', 'readwrite');
      const req = store.put(sesion);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getSesion(id: string): Promise<Sesion | undefined> {
    if (this.currentUser) {
      const docRef = this.getSesionDoc(this.currentUser.uid, id);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? (docSnap.data() as Sesion) : undefined;
    }

    return new Promise((resolve, reject) => {
      const store = this.getStore('sesiones', 'readonly');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllSesiones(): Promise<Sesion[]> {
    if (this.currentUser) {
      const collRef = this.getSesionesColl(this.currentUser.uid);
      const querySnapshot = await getDocs(collRef);
      const list: Sesion[] = [];
      querySnapshot.forEach((d) => list.push(d.data() as Sesion));
      return list;
    }

    return new Promise((resolve, reject) => {
      const store = this.getStore('sesiones', 'readonly');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async getSesionesByType(type: NovedadType): Promise<Sesion[]> {
    if (this.currentUser) {
      const collRef = this.getSesionesColl(this.currentUser.uid);
      const q = query(collRef, where('type', '==', type));
      const querySnapshot = await getDocs(q);
      const list: Sesion[] = [];
      querySnapshot.forEach((d) => list.push(d.data() as Sesion));
      return list;
    }

    return new Promise((resolve, reject) => {
      const store = this.getStore('sesiones', 'readonly');
      const index = store.index('type');
      const req = index.getAll(type);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  // --- EXPORT / IMPORT (Backup) ---
  async deleteSesion(id: string): Promise<void> {
    const novedades = await this.getNovedadesBySession(id);
    
    if (this.currentUser) {
      const batch = writeBatch(dbFirestore);
      batch.delete(this.getSesionDoc(this.currentUser.uid, id));
      for (const nov of novedades) {
        batch.delete(this.getNovedadDoc(this.currentUser.uid, nov.id));
      }
      await batch.commit();
      return;
    }

    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('DB not initialized'));
      const tx = this.db.transaction(['sesiones', 'novedades'], 'readwrite');
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      
      const sesStore = tx.objectStore('sesiones');
      const novStore = tx.objectStore('novedades');

      sesStore.delete(id);
      for (const nov of novedades) {
        novStore.delete(nov.id);
      }
    });
  }

  async exportData(): Promise<string> {
    const animals = await this.getAllAnimals();
    const novedades = await this.getAllNovedades();
    const config = await this.getConfig();
    const sesiones = await this.getAllSesiones();
    return JSON.stringify({ animals, novedades, config, sesiones });
  }

  async importData(jsonData: string): Promise<void> {
    if (this.currentUser) {
      const data = JSON.parse(jsonData);

      if (data.config) await this.saveConfig(data.config);

      if (data.animals && Array.isArray(data.animals)) {
        for (const animal of data.animals) {
          await this.saveAnimal(animal);
        }
      }

      if (data.novedades && Array.isArray(data.novedades)) {
        for (const nov of data.novedades) {
          await this.saveNovedad(nov);
        }
      }

      if (data.sesiones && Array.isArray(data.sesiones)) {
        for (const ses of data.sesiones) {
          await this.saveSesion(ses);
        }
      }
      return;
    }

    const data = JSON.parse(jsonData);

    if (data.config) await this.saveConfig(data.config);

    if (data.animals && Array.isArray(data.animals)) {
      for (const animal of data.animals) {
        await this.saveAnimal(animal);
      }
    }

    if (data.novedades && Array.isArray(data.novedades)) {
      for (const nov of data.novedades) {
        await this.saveNovedad(nov);
      }
    }

    if (data.sesiones && Array.isArray(data.sesiones)) {
      for (const ses of data.sesiones) {
        await this.saveSesion(ses);
      }
    }
  }

  // --- MIGRATION LOCAL TO CLOUD ---
  async migrateLocalToCloud(userId: string): Promise<void> {
    // 1. Get all local data from IndexedDB
    const localAnimals = await new Promise<Animal[]>((resolve, reject) => {
      const store = this.getStore('animals', 'readonly');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    const localNovedades = await new Promise<Novedad[]>((resolve, reject) => {
      const store = this.getStore('novedades', 'readonly');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    const localSesiones = await new Promise<Sesion[]>((resolve, reject) => {
      const store = this.getStore('sesiones', 'readonly');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    const localConfig = await new Promise<AppConfig | null>((resolve) => {
      const store = this.getStore('config', 'readonly');
      const req = store.get('main');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });

    // 2. Upload to Firestore
    if (localConfig) {
      const docRef = this.getConfigDoc(userId);
      await setDoc(docRef, localConfig);
    }

    const allItems = [
      ...localAnimals.map(a => ({ ref: this.getAnimalDoc(userId, a.id), data: a })),
      ...localNovedades.map(n => ({ ref: this.getNovedadDoc(userId, n.id), data: n })),
      ...localSesiones.map(s => ({ ref: this.getSesionDoc(userId, s.id), data: s }))
    ];

    // Batch items in chunks of 400
    const chunkSize = 400;
    for (let i = 0; i < allItems.length; i += chunkSize) {
      const chunk = allItems.slice(i, i + chunkSize);
      const batch = writeBatch(dbFirestore);
      for (const item of chunk) {
        batch.set(item.ref, item.data);
      }
      await batch.commit();
    }
  }

  // --- CLEAR ALL DATA ---
  async clearAllData(): Promise<void> {
    if (this.currentUser) {
      const userId = this.currentUser.uid;
      // Delete animals
      const animals = await this.getAllAnimals();
      for (const a of animals) {
        await deleteDoc(this.getAnimalDoc(userId, a.id));
      }
      // Delete novedades
      const novedades = await this.getAllNovedades();
      for (const n of novedades) {
        await deleteDoc(this.getNovedadDoc(userId, n.id));
      }
      // Delete sesiones
      const sesiones = await this.getAllSesiones();
      for (const s of sesiones) {
        await deleteDoc(this.getSesionDoc(userId, s.id));
      }
      // Delete config
      await deleteDoc(this.getConfigDoc(userId));
      return;
    }

    const stores = ['animals', 'novedades', 'config', 'sesiones'];
    for (const storeName of stores) {
      await new Promise<void>((resolve, reject) => {
        const store = this.getStore(storeName, 'readwrite');
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  }
}

export const db = new Database();
