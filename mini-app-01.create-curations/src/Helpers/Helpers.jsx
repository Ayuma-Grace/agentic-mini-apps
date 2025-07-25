import { store } from "../Store/Store";
import { finalizeEvent, nip19 } from "nostr-tools";
import axios from "axios";
import { ndkInstance } from "./NDKInstance";

// ======================
// Error Handling Utilities
// ======================
const handleNostrError = (error, context = "") => {
  console.error(`Nostr Error [${context}]:`, error);
  store.dispatch(setToast({
    type: 2, // Error type
    desc: `Error ${context}` 
  }));
  return false;
};

// ======================
// User Metadata Utilities
// ======================
/**
 * @typedef {Object} UserMetadata
 * @property {string} name
 * @property {string} display_name
 * @property {string} picture
 * @property {string} banner
 * @property {string} about
 * @property {string} lud06
 * @property {string} lud16
 * @property {string} nip05
 * @property {string} website
 * @property {string} pubkey
 * @property {number} created_at
 */

/**
 * Creates empty user metadata
 * @param {string} pubkey - User public key
 * @returns {UserMetadata}
 */
export const getEmptyuserMetadata = (pubkey) => {
  return {
    name: nip19.npubEncode(pubkey).substring(0, 10),
    display_name: nip19.npubEncode(pubkey).substring(0, 10),
    picture: "",
    banner: "",
    about: "",
    lud06: "",
    lud16: "",
    nip05: "",
    website: "",
    pubkey,
    created_at: 0,
  };
};

/**
 * Parses author metadata from Nostr event
 * @param {Object} data - Nostr event data
 * @returns {UserMetadata}
 */
export const getParsedAuthor = (data) => {
  try {
    const content = JSON.parse(data.content) || {};
    return {
      display_name: content?.display_name || content?.name || data.pubkey.substring(0, 10),
      name: content?.name || content?.display_name || data.pubkey.substring(0, 10),
      picture: content?.picture || "",
      pubkey: data.pubkey,
      banner: content?.banner || "",
      about: content?.about || "",
      lud06: content?.lud06 || "",
      lud16: content?.lud16 || "",
      website: content?.website || "",
      nip05: content?.nip05 || "",
    };
  } catch (error) {
    return getEmptyuserMetadata(data.pubkey);
  }
};

// ======================
// Event Processing Utilities
// ======================
/**
 * Sorts events by creation time (newest first)
 * @param {Array} events - Array of Nostr events
 * @returns {Array} Sorted events
 */
export const sortEvents = (events) => {
  return [...events].sort((a, b) => b.created_at - a.created_at);
};

/**
 * Subscribes to Nostr events with filters
 * @param {Array} filter - Nostr filter array
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<{data: Array, pubkeys: Array}>}
 */
export const getSubData = async (filter, timeout = 1000) => {
  if (!filter || filter.length === 0) return { data: [], pubkeys: [] };

  try {
    return await new Promise((resolve) => {
      const events = [];
      const pubkeys = new Set();

      const cleanFilter = filter.map(f => {
        const { "#t": _, ...rest } = f;
        return rest;
      });

      const sub = ndkInstance.subscribe(cleanFilter, {
        cacheUsage: "CACHE_FIRST",
        groupable: false,
        skipVerification: true,
        skipValidation: true,
      });

      let timer = setTimeout(() => {
        sub.stop();
        resolve({
          data: sortEvents(events),
          pubkeys: Array.from(pubkeys),
        });
      }, timeout);

      sub.on("event", (event) => {
        pubkeys.add(event.pubkey);
        events.push(event.rawEvent());
        clearTimeout(timer);
        timer = setTimeout(() => {
          sub.stop();
          resolve({
            data: sortEvents(events),
            pubkeys: Array.from(pubkeys),
          });
        }, timeout);
      });
    });
  } catch (error) {
    return handleNostrError(error, "in event subscription");
  }
};

// ======================
// Media Handling Utilities
// ======================
const VIDEO_PLATFORMS = {
  youtube: {
    regex: /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|youtu\.be\/)([^"&?\/\s]{11})/,
    embed: (id) => `https://www.youtube.com/embed/${id}`,
  },
  vimeo: {
    regex: /vimeo\.com\/(?:channels\/|groups\/[^\/]*\/videos\/|)(\d+)(?:|\/\?)/,
    embed: (id) => `https://player.vimeo.com/video/${id}`,
  },
};

/**
 * Detects video platform from URL
 * @param {string} url - Video URL
 * @returns {Object|null} Platform info or null
 */
const detectVideoPlatform = (url) => {
  for (const [platform, { regex, embed }] of Object.entries(VIDEO_PLATFORMS)) {
    const match = url.match(regex);
    if (match) {
      return {
        platform,
        videoId: match[1],
        embedUrl: embed(match[1]),
      };
    }
  }
  return null;
};

/**
 * Renders video player based on URL
 * @param {string} url - Video URL
 * @returns {JSX.Element} Video player component
 */
export const getVideoFromURL = (url) => {
  const videoInfo = detectVideoPlatform(url);

  if (videoInfo) {
    return (
      <iframe
        style={{
          width: "100%",
          aspectRatio: "16/9",
          borderRadius: "var(--border-r-18)",
        }}
        src={videoInfo.embedUrl}
        frameBorder="0"
        allowFullScreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      />
    );
  }

  return (
    <video
      controls
      autoPlay={false}
      width="100%"
      className="sc-s-18"
      style={{ border: "none", aspectRatio: "16/9" }}
    >
      <source src={url} type="video/mp4" />
    </video>
  );
};

/**
 * Handles file uploads to Nostr.build
 * @param {File} file - File to upload
 * @param {string} pubkey - User public key
 * @param {Function} cb - Progress callback
 * @returns {Promise<string|false>} File URL or false
 */
export const FileUpload = async (file, pubkey, cb) => {
  const endpoint = "https://nostr.build/api/v2/nip96/upload";
  
  try {
    if (!file) throw new Error("No file provided");
    if (!pubkey) throw new Error("No pubkey provided");

    const event = finalizeEvent({
      kind: 27235,
      content: "",
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["u", endpoint],
        ["method", "POST"],
      ],
    }, pubkey);

    const fd = new FormData();
    fd.append("file", file);

    const { data } = await axios.post(endpoint, fd, {
      headers: {
        Authorization: `Nostr ${encodeBase64URL(JSON.stringify(event))}`,
      },
      onUploadProgress: cb ? (progress) => {
        const percent = Math.round((progress.loaded * 100) / progress.total);
        cb(percent);
      } : undefined,
    });

    const urlTag = data.nip94_event?.tags?.find(tag => tag[0] === "url");
    if (!urlTag) throw new Error("No URL found in response");
    
    return urlTag[1];
  } catch (error) {
    return handleNostrError(error, "uploading file");
  }
};

// ======================
// NIP-05 Utilities
// ======================
/**
 * Resolves NIP-05 address to pubkey
 * @param {string} nip05Addr - NIP-05 address
 * @returns {Promise<string|false>} Public key or false
 */
export const getAuthPubkeyFromNip05 = async (nip05Addr) => {
  try {
    const [name = "_", domain] = nip05Addr.split("@");
    if (!domain) throw new Error("Invalid NIP-05 format");
    
    const { data } = await axios.get(
      `https://${domain}/.well-known/nostr.json?name=${name}`,
      { timeout: 5000 }
    );
    
    if (!data?.names?.[name]) throw new Error("Name not found in response");
    return data.names[name];
  } catch (error) {
    return handleNostrError(error, "resolving NIP-05");
  }
};

// ======================
// Search and Sorting Utilities
// ======================
/**
 * Calculates Levenshtein distance between strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Distance score
 */
const getLevenshteinDistance = (a, b) => {
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, (_, i) => 
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
};

/**
 * Sorts array by keyword relevance
 * @param {Array} array - Items to sort
 * @param {string} keyword - Search keyword
 * @returns {Array} Sorted array
 */
export const sortByKeyword = (array, keyword) => {
  if (!keyword) return array;

  return array
    .filter(item => item.display_name || item.name)
    .sort((a, b) => {
      const aName = (a.display_name || a.name).toLowerCase();
      const bName = (b.display_name || b.name).toLowerCase();
      const kw = keyword.toLowerCase();

      // Priority factors
      const factors = [
        // NIP-05 verification
        (item) => item.nip05 ? 1 : 0,
        // Starts with keyword
        (item) => item.name.toLowerCase().startsWith(kw) ? 2 : 0,
        // Contains keyword
        (item) => item.name.toLowerCase().includes(kw) ? 1 : 0,
        // Levenshtein distance (inverted)
        (item) => -getLevenshteinDistance(item.name.toLowerCase(), kw)
      ];

      const score = (item) => factors.reduce((sum, fn) => sum + fn(item), 0);
      return score(b) - score(a);
    });
};

// ======================
// Encoding Utilities
// ======================
const encodeBase64URL = (string) => {
  return btoa(string)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

// ======================
// Validation Utilities
// ======================
export const isHex = (str) => {
  return /^[0-9a-fA-F]+$/.test(str) && str.length % 2 === 0;
};

// ======================
// Store Selectors
// ======================
export const selectUserByPubkey = (pubkey) => (state) => 
  state.nostrAuthors.find((item) => item.pubkey === pubkey);

export const getUser = (pubkey) => {
  return selectUserByPubkey(pubkey)(store.getState());
};

// ======================
// Event Parsing Utilities
// ======================
export const getParsedRepEvent = (event) => {
  try {
    if (!event) throw new Error("No event provided");

    const content = {
      id: event.id,
      pubkey: event.pubkey,
      kind: event.kind,
      content: event.content,
      created_at: event.created_at,
      tags: event.tags,
      author: getEmptyuserMetadata(event.pubkey),
      title: [34235, 34236, 30033].includes(event.kind) ? event.content : "",
      description: "",
      image: "",
      imagePP: "",
      published_at: event.created_at,
      contentSensitive: false,
      d: "",
      client: "",
      items: [],
      tTags: [],
      seenOn: event.onRelays
        ? [...new Set(event.onRelays.map(relay => relay.url))]
        : [],
    };

    // Process tags
    const tagProcessors = {
      title: (val) => content.title = val,
      image: (val) => content.image = val,
      thumbnail: (val) => content.image = val,
      thumb: (val) => content.image = val,
      description: (val) => content.description = val,
      excerpt: (val) => content.description = val,
      summary: (val) => content.description = val,
      d: (val) => content.d = val,
      published_at: (val) => content.published_at = parseInt(val),
      client: (val, tag) => {
        content.client = tag.length >= 3 && tag[2].includes("31990") 
          ? tag[2] 
          : tag[1];
      },
      L: (val) => val === "content-warning" && (content.contentSensitive = true),
      a: (val) => content.items.push(val),
      e: (val) => content.items.push(val),
      r: (val) => content.items.push(val),
      t: (val, tag) => {
        if (tag.length === 2) content.tTags.push(val);
        content.items.push(val);
      }
    };

    event.tags.forEach(tag => {
      const [tagName, tagValue] = tag;
      if (tagProcessors[tagName]) {
        tagProcessors[tagName](tagValue, tag);
      }
    });

    // Generate NIP-19 addresses
    if (content.d) {
      content.naddr = nip19.naddrEncode({
        pubkey: event.pubkey,
        identifier: content.d,
        kind: event.kind,
      });
      content.naddrData = {
        pubkey: event.pubkey,
        identifier: content.d,
        kind: event.kind,
      };
      content.aTag = `${event.kind}:${event.pubkey}:${content.d}`;
    }

    return content;
  } catch (error) {
    return handleNostrError(error, "parsing event");
  }
};