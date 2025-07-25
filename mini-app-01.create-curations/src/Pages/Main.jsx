import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { ndkInstance } from '../Helpers/NDKInstance';
import { addCuration, setRelays } from '../store/slice/StoreSlice';
import { getActiveRelays } from '../Content/Relays';
import { formatDate, shortenPubkey } from '../Helpers/Helpers';

const Main = () => {
  const dispatch = useDispatch();
  const { curations, relays, isLoading } = useSelector(state => state.curation);

  useEffect(() => {
    const fetchRelays = async () => {
      try {
        dispatch(setLoading(true));
        const activeRelays = await getActiveRelays();
        dispatch(setRelays(activeRelays));
      } catch (error) {
        console.error(error);
      } finally {
        dispatch(setLoading(false));
      }
    };

    fetchRelays();
    
    // Subscribe to new curation events
    const sub = ndkInstance.subscribe({
      kinds: [30023], // Kind for long-form content (NIP-23)
      limit: 10
    });
    
    sub.on('event', (event) => {
      const curation = {
        id: event.id,
        title: event.tags.find(t => t[0] === 'title')?.[1] || 'Untitled',
        content: event.content,
        author: shortenPubkey(event.pubkey),
        createdAt: formatDate(event.created_at),
        relays: event.relays
      };
      dispatch(addCuration(curation));
    });
    
    return () => sub.stop();
  }, [dispatch]);

  return (
    <div className="main-container">
      <h1>Nostr Curation Dashboard</h1>
      
      <div className="relay-status">
        <h2>Connected Relays</h2>
        {isLoading ? (
          <p>Loading relays...</p>
        ) : (
          <ul>
            {relays.map((relay, index) => (
              <li key={index}>{relay}</li>
            ))}
          </ul>
        )}
      </div>
      
      <div className="curations-list">
        <h2>Latest Curations</h2>
        {curations.map(curation => (
          <div key={curation.id} className="curation-card">
            <h3>{curation.title}</h3>
            <p>By {curation.author} • {curation.createdAt}</p>
            <p>{curation.content.substring(0, 200)}...</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Main;