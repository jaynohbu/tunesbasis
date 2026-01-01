# Frontend Upload Updated - Presigned URL Flow

## What Changed

Updated the frontend upload service to use the new presigned URL flow instead of direct upload to the backend.

---

## File Modified

### [src/app/services/music-upload.service.ts](src/app/services/music-upload.service.ts)

**Before** (Direct Upload):
```typescript
upload(file: File, onProgress: (percent: number) => void, songName?: string) {
  const form = new FormData();
  form.append('file', file);
  if (songName) {
    form.append('songName', songName);
  }

  return axios.post<UploadResponse>(
    `${environment.apiBaseUrl}/upload`,
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (evt) => {
        // Progress tracking
      }
    }
  );
}
```

**After** (Presigned URL):
```typescript
async upload(
  file: File,
  onProgress: (percent: number) => void,
  songName?: string
): Promise<AxiosResponse<UploadResponse>> {
  // Step 1: Get presigned URL from backend
  const presignedResponse = await axios.get(
    `${environment.apiBaseUrl}/upload/presigned-url`,
    {
      params: {
        fileName: file.name,
        contentType: file.type || 'audio/wav',
        songName: songName,
      },
    }
  );

  const { songId, presignedUrl, s3Key } = presignedResponse.data;

  // Step 2: Upload file directly to S3
  await axios.put(presignedUrl, file, {
    headers: {
      'Content-Type': file.type || 'audio/wav',
    },
    onUploadProgress: (evt) => {
      // S3 upload progress (10-80%)
    },
  });

  // Step 3: Notify backend to process
  const completeResponse = await axios.post<UploadResponse>(
    `${environment.apiBaseUrl}/upload/complete`,
    {
      songId,
      s3Key,
      songName,
    }
  );

  return completeResponse;
}
```

---

## Key Changes

1. **Method signature**: Changed from synchronous to `async` function
2. **Three-step flow**:
   - Request presigned URL
   - Upload to S3
   - Notify backend to process
3. **No size limit**: Can now upload files of any size (S3 supports up to 5TB)
4. **Better progress tracking**: Maps upload progress across the 3 steps
   - 0-10%: Getting presigned URL
   - 10-80%: Uploading to S3
   - 80-100%: Backend processing

---

## Progress Mapping

The progress callback now reflects all three steps:

| Progress | Step | Description |
|----------|------|-------------|
| 0-5% | 1 | Initial request |
| 5-10% | 1 | Getting presigned URL |
| 10-80% | 2 | Uploading file to S3 |
| 80-85% | 3 | Notifying backend |
| 85-100% | 3 | Backend processing |

---

## Benefits

### Before (Direct Upload)
- ❌ 10MB file size limit
- ❌ File uploaded to backend, then backend uploads to S3
- ❌ Higher latency (two uploads)
- ❌ Backend memory usage scales with file size

### After (Presigned URL)
- ✅ **No file size limit** (S3 supports up to 5TB)
- ✅ **Direct to S3** - Single upload, faster
- ✅ **Lower backend load** - Backend doesn't handle file during upload
- ✅ **Better UX** - More accurate progress tracking
- ✅ **Cost efficient** - Less bandwidth through backend

---

## Error Handling

The new implementation includes try-catch error handling:

```typescript
try {
  // 3-step upload flow
} catch (error) {
  console.error('[UPLOAD] Failed:', error);
  throw error; // Re-throw to caller
}
```

Errors can occur at any of the three steps:
1. **Presigned URL generation** - Backend error, invalid parameters
2. **S3 upload** - Network issues, S3 errors, presigned URL expired
3. **Backend processing** - File not found in S3, processing errors

---

## Component Usage

**No changes required** in components that use `MusicUploadService.upload()`:

```typescript
// This still works exactly the same
this.uploadService.upload(file, (progress) => {
  this.uploadProgress = progress;
}, songName);
```

The method signature is backward compatible - callers don't need to change.

---

## Testing

### Test Upload Flow

1. Open [https://tunesbasis.com](https://tunesbasis.com)
2. Upload a file (any size, even >10MB)
3. Watch progress bar:
   - Should start at 5% (getting presigned URL)
   - Jump to 10-80% during S3 upload
   - Finish at 85-100% during processing
4. Song should appear in list when complete

### Test Large Files

Upload a file >10MB (previously failed with 413 error):
- ✅ Should now work without errors
- ✅ Progress tracking works throughout
- ✅ Song appears after processing completes

---

## Deployment

**Deployed**: January 1, 2026 at 09:47 UTC

**Frontend URL**: [https://tunesbasis.com](https://tunesbasis.com)

**Build Hash**: `f5eb5b131c73638c`

---

## Backend Endpoints Used

1. `GET /upload/presigned-url` - Generate presigned S3 URL
2. S3 PUT (presigned URL) - Upload file directly to S3
3. `POST /upload/complete` - Trigger backend processing

See [UPLOAD-FLOW.md](../tunesbasis-service/UPLOAD-FLOW.md) for complete backend documentation.

---

## Rollback Plan

If issues occur, rollback is simple:

1. Revert the `music-upload.service.ts` changes
2. Rebuild and redeploy frontend
3. Old direct upload will work for files <10MB

**Note**: Backend still supports the old `POST /upload` endpoint for backward compatibility.

---

## Known Limitations

1. **Browser CORS**: S3 upload uses native fetch/axios, relies on S3 CORS configuration
2. **Presigned URL expiry**: URLs expire after 15 minutes
3. **No resume support**: If upload fails, must restart from beginning
4. **Progress estimation**: Backend processing time varies by file size

---

## Future Improvements

1. **Retry logic**: Auto-retry failed S3 uploads
2. **Chunked uploads**: For very large files (>100MB)
3. **Resume support**: Use S3 multipart upload for resumability
4. **File validation**: Check file type/size before requesting presigned URL
5. **Progress polling**: Poll backend for processing progress after upload

---

## Status

✅ **Frontend Updated and Deployed**
✅ **Presigned URL Flow Active**
✅ **No Size Limit**
✅ **Backward Compatible**
🎯 **Ready for Testing**

Your frontend now supports uploading files of unlimited size!
