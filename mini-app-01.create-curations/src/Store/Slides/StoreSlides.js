import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  curations: [],
  relays: [],
  isLoading: false,
  error: null
};

const curationSlice = createSlice({
  name: 'curation',
  initialState,
  reducers: {
    addCuration: (state, action) => {
      state.curations.push(action.payload);
    },
    setRelays: (state, action) => {
      state.relays = action.payload;
    },
    setLoading: (state, action) => {
      state.isLoading = action.payload;
    },
    setError: (state, action) => {
      state.error = action.payload;
    }
  }
});

export const { addCuration, setRelays, setLoading, setError } = curationSlice.actions;
export default curationSlice.reducer;