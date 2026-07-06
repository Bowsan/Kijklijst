import Database from 'better-sqlite3';
const db=new Database(process.env.DB);const now=Date.now();
const me='user-me', sam='user-sam';
for(const [id,name] of [[me,'Ik'],[sam,'Sam']])
  db.prepare("INSERT OR REPLACE INTO profiles (id,name,services,updated_at) VALUES (?,?,?,?)").run(id,name,'[]',now);
db.prepare("INSERT OR REPLACE INTO follows (follower,followee,created_at) VALUES (?,?,?)").run(me,sam,now);
db.prepare(`INSERT OR REPLACE INTO titles (tmdb_id,name,year,poster_path,genres,seasons,episode_count,runtime,providers,overview,cast,added_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(1,'Severance',2022,null,'["Drama"]',JSON.stringify([{season_number:1,episode_count:9,name:'S1',air_year:2022}]),9,45,'["Apple TV"]','','[]',me,now);
db.prepare("INSERT OR REPLACE INTO ratings (title_id,user_id,score,status,seasons,service,note,updated_at) VALUES (?,?,?,?,?,?,?,?)").run(1,me,9,'finished','[1]','Apple TV',null,now);
// ik tipte Severance aan Sam
db.prepare("INSERT INTO recommendations (id,from_user,to_user,title_id,note,dismissed,created_at) VALUES ('r1',?,?,1,'Echt kijken!',0,?)").run(me,sam,now);
console.log('seeded');
