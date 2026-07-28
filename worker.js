const MOODS = new Set(["expect", "yummy", "again", "bali", "strange", "spicy"]);
const MEAL_TAGS = new Set(["before", "breakfast", "lunch", "cafe", "dinner", "snack"]);
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function errorJson(message, status = 400) {
  return json({ error: message }, status);
}

async function handlePostList(env) {
  const { results } = await env.GOURMET_DB.prepare(
    "SELECT id, device_id, name, mood, meal_tag, location, caption, created_at, updated_at FROM posts ORDER BY created_at DESC LIMIT 300"
  ).all();
  const posts = results.map((row) => ({
    ...row,
    photo_url: `/api/gourmet/photo/${row.id}`,
  }));
  return json({ posts });
}

async function handlePostCreate(request, env) {
  const form = await request.formData();
  const name = (form.get("name") || "").toString().trim();
  const mood = (form.get("mood") || "").toString().trim();
  const mealTag = (form.get("meal_tag") || "").toString().trim();
  const location = (form.get("location") || "").toString().trim();
  const caption = (form.get("caption") || "").toString().trim();
  const deviceId = (form.get("device_id") || "").toString().trim();
  const photo = form.get("photo");

  if (!deviceId) return errorJson("device_id is required");
  if (!name) return errorJson("name is required");
  if (!MOODS.has(mood)) return errorJson("invalid mood");
  if (!MEAL_TAGS.has(mealTag)) return errorJson("invalid meal_tag");
  if (!(photo instanceof File)) return errorJson("photo is required");
  if (photo.size > MAX_PHOTO_BYTES) return errorJson("photo too large", 413);

  const id = crypto.randomUUID();
  const photoKey = `posts/${id}.jpg`;
  const buffer = await photo.arrayBuffer();

  await env.GOURMET_PHOTOS.put(photoKey, buffer, {
    httpMetadata: { contentType: photo.type || "image/jpeg" },
  });

  const now = Date.now();
  await env.GOURMET_DB.prepare(
    `INSERT INTO posts (id, device_id, name, mood, meal_tag, location, caption, photo_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, deviceId, name, mood, mealTag, location, caption, photoKey, now, now)
    .run();

  return json(
    {
      id,
      device_id: deviceId,
      name,
      mood,
      meal_tag: mealTag,
      location,
      caption,
      photo_url: `/api/gourmet/photo/${id}`,
      created_at: now,
      updated_at: now,
    },
    201
  );
}

async function handlePhotoGet(id, env) {
  const row = await env.GOURMET_DB.prepare("SELECT photo_key FROM posts WHERE id = ?")
    .bind(id)
    .first();
  if (!row) return new Response("Not found", { status: 404 });

  const object = await env.GOURMET_PHOTOS.get(row.photo_key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
}

async function handlePostUpdate(id, request, env) {
  const body = await request.json().catch(() => null);
  if (!body || !body.device_id) return errorJson("device_id is required");

  const row = await env.GOURMET_DB.prepare("SELECT device_id FROM posts WHERE id = ?")
    .bind(id)
    .first();
  if (!row) return errorJson("post not found", 404);
  if (row.device_id !== body.device_id) return errorJson("not your post", 403);

  const fields = [];
  const values = [];
  if (body.mood !== undefined) {
    if (!MOODS.has(body.mood)) return errorJson("invalid mood");
    fields.push("mood = ?");
    values.push(body.mood);
  }
  if (body.meal_tag !== undefined) {
    if (!MEAL_TAGS.has(body.meal_tag)) return errorJson("invalid meal_tag");
    fields.push("meal_tag = ?");
    values.push(body.meal_tag);
  }
  if (body.location !== undefined) {
    fields.push("location = ?");
    values.push(String(body.location).trim());
  }
  if (body.caption !== undefined) {
    fields.push("caption = ?");
    values.push(String(body.caption).trim());
  }
  if (fields.length === 0) return errorJson("nothing to update");

  fields.push("updated_at = ?");
  values.push(Date.now());
  values.push(id);

  await env.GOURMET_DB.prepare(`UPDATE posts SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  return json({ ok: true });
}

async function handlePostDelete(id, request, env) {
  const body = await request.json().catch(() => null);
  if (!body || !body.device_id) return errorJson("device_id is required");

  const row = await env.GOURMET_DB.prepare("SELECT device_id, photo_key FROM posts WHERE id = ?")
    .bind(id)
    .first();
  if (!row) return errorJson("post not found", 404);
  if (row.device_id !== body.device_id) return errorJson("not your post", 403);

  await env.GOURMET_PHOTOS.delete(row.photo_key);
  await env.GOURMET_DB.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();

  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    try {
      if (pathname === "/api/gourmet/posts" && request.method === "GET") {
        return await handlePostList(env);
      }
      if (pathname === "/api/gourmet/posts" && request.method === "POST") {
        return await handlePostCreate(request, env);
      }
      const postMatch = pathname.match(/^\/api\/gourmet\/posts\/([a-f0-9-]+)$/);
      if (postMatch && request.method === "PATCH") {
        return await handlePostUpdate(postMatch[1], request, env);
      }
      if (postMatch && request.method === "DELETE") {
        return await handlePostDelete(postMatch[1], request, env);
      }
      const photoMatch = pathname.match(/^\/api\/gourmet\/photo\/([a-f0-9-]+)$/);
      if (photoMatch && request.method === "GET") {
        return await handlePhotoGet(photoMatch[1], env);
      }
    } catch (err) {
      return errorJson(`server error: ${err.message}`, 500);
    }

    return env.ASSETS.fetch(request);
  },
};
