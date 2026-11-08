import {normalizeStoreProfile} from '../shared/first-access.mjs';

// Armazenado no SQLite canônico, incluído no backup e compartilhado entre terminais LAN.
export function createStoreProfile(db){
  db.exec(`CREATE TABLE IF NOT EXISTS store_profile (
    id INTEGER PRIMARY KEY CHECK(id=1),
    name TEXT NOT NULL,
    document TEXT NOT NULL,
    address TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  function getStoreProfile(){
    return db.prepare('SELECT name,document,address,updated_at FROM store_profile WHERE id=1').get()
      ||{name:'',document:'',address:'',updated_at:null};
  }
  function saveStoreProfile(input){
    const profile=normalizeStoreProfile(input);
    const now=new Date().toISOString();
    db.prepare(`INSERT INTO store_profile(id,name,document,address,updated_at)
      VALUES(1,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,document=excluded.document,
        address=excluded.address,updated_at=excluded.updated_at`)
      .run(profile.name,profile.document,profile.address,now);
    return getStoreProfile();
  }
  return {getStoreProfile,saveStoreProfile};
}
