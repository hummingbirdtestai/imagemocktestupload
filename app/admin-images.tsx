import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Pressable,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '@/lib/supabase';

const SUBJECTS = [
  'Anatomy',
  'Physiology',
  'Biochemistry',
  'Pathology',
  'Pharmacology',
  'Microbiology',
  'Community Medicine',
  'Forensic Medicine',
  'ENT',
  'Ophthalmology',
  'Medicine',
  'Surgery',
  'Pediatrics',
  'OBG',
  'Orthopedics',
  'Dermatology',
  'Psychiatry',
  'Radiology',
  'Anesthesia',
];

const FASTAPI_URL =
  process.env.EXPO_PUBLIC_FASTAPI_URL ||
  'https://mainbunnypy-production.up.railway.app/upload-image-to-bunny';

type ImageRow = {
  id: string;
  subject: string;
  react_order_final: string;
  image_url: string | null;
  supabase_image_url: string | null;
};

type ClassifiedRows = {
  noImages: ImageRow[];
  externalOnly: ImageRow[];
  uploaded: ImageRow[];
};

type TabKey = 'NO_IMAGES' | 'EXTERNAL_ONLY' | 'UPLOADED';

export default function AdminImagesScreen() {
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ImageRow[]>([]);
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<TabKey>('NO_IMAGES');

  const fetchImages = async (subject: string) => {
    console.log('[ADMIN][FETCH_IMAGES][START]', { subject });
    setLoading(true);
    setRows([]);

    try {
      const { data, error } = await supabase.rpc('get_images_v2', {
        p_subject: subject,
      });

      console.log('[ADMIN][FETCH_IMAGES][RPC_RESULT]', {
        subject,
        rowCount: data?.length ?? 0,
        error,
      });

      if (error) {
        console.error('[ADMIN][FETCH_IMAGES][ERROR]', error);
        Alert.alert('Error', error.message);
        return;
      }

      setRows(data || []);
    } catch (err) {
      Alert.alert('Error', 'Failed to fetch images');
    } finally {
      console.log('[ADMIN][FETCH_IMAGES][DONE]');
      setLoading(false);
    }
  };

  const handleSubjectSelect = (subject: string) => {
    console.log('[ADMIN][SUBJECT_SELECT]', subject);
    setSelectedSubject(subject);
    fetchImages(subject);
  };

  const classifyRows = (): ClassifiedRows => {
    const classified: ClassifiedRows = {
      noImages: [],
      externalOnly: [],
      uploaded: [],
    };

    rows.forEach((row) => {
      if (row.image_url === null && row.supabase_image_url === null) {
        classified.noImages.push(row);
      } else if (row.image_url !== null && row.supabase_image_url === null) {
        classified.externalOnly.push(row);
      } else if (row.image_url !== null && row.supabase_image_url !== null) {
        classified.uploaded.push(row);
      }
      // Rows with (image_url === null && supabase_image_url !== null)
      // are intentionally excluded from all tabs
    });

    return classified;
  };

  const handleDownload = (imageUrl: string) => {
    if (typeof window !== 'undefined') {
      window.open(imageUrl, '_blank');
    }
  };

  const handleUpload = async (row: ImageRow) => {
    console.log('[ADMIN][UPLOAD][CLICKED]', {
      rowId: row.id,
      subject: row.subject,
      reactOrder: row.react_order_final,
    });

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });

      console.log('[ADMIN][UPLOAD][PICKER_RESULT]', result);

      if (result.canceled) {
        console.warn('[ADMIN][UPLOAD][CANCELLED]');
        return;
      }

      const file = result.assets[0];

      console.log('[ADMIN][UPLOAD][FILE]', {
        name: file.name,
        uri: file.uri,
        mimeType: file.mimeType,
        size: file.size,
      });

      setUploadingIds((prev) => new Set(prev).add(row.id));

      const formData = new FormData();

      // 🌐 EXPO WEB FIX — convert blob URL to real file
      if (typeof window !== 'undefined') {
        console.log('[ADMIN][UPLOAD][WEB_BLOB_FETCH_START]');
        const blob = await fetch(file.uri).then(res => res.blob());
        console.log('[ADMIN][UPLOAD][WEB_BLOB_FETCH_DONE]', blob);

        formData.append('file', blob, file.name);
      } else {
        // 📱 MOBILE (already correct)
        formData.append('file', {
          uri: file.uri,
          type: file.mimeType || 'image/jpeg',
          name: file.name,
        } as any);
      }

      // ✅ REQUIRED — append row_id ONCE
      formData.append('row_id', row.id);

      console.log('[ADMIN][UPLOAD][FORMDATA_READY]', {
        rowId: row.id,
        endpoint: FASTAPI_URL,
      });

      console.log('[ADMIN][UPLOAD][REQUEST_SENT]');

      const response = await fetch(FASTAPI_URL, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
        },
      });

      console.log('[ADMIN][UPLOAD][RESPONSE_STATUS]', response.status);

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();

      console.log('[ADMIN][UPLOAD][RESPONSE_BODY]', data);

      if (data.status === 'ok') {
        if (selectedSubject) {
          console.log('[ADMIN][UPLOAD][REFRESHING_IMAGES]', selectedSubject);
          await fetchImages(selectedSubject);
        }
      } else {
        console.error('[ADMIN][UPLOAD][FAILED]', data);
        Alert.alert('Error', 'Upload failed');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to upload image');
    } finally {
      console.log('[ADMIN][UPLOAD][CLEANUP]', row.id);
      setUploadingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(row.id);
        return newSet;
      });
    }
  };

  const classified = classifyRows();

  console.log('[ADMIN][CLASSIFY]', {
    total: rows.length,
    noImages: classified.noImages.length,
    externalOnly: classified.externalOnly.length,
    uploaded: classified.uploaded.length,
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Image Admin</Text>
      </View>

      <View style={styles.subjectContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subjectScroll}>
          {SUBJECTS.map((subject) => (
            <TouchableOpacity
              key={subject}
              style={[
                styles.subjectPill,
                selectedSubject === subject && styles.subjectPillSelected,
              ]}
              onPress={() => handleSubjectSelect(subject)}
            >
              <Text
                style={[
                  styles.subjectText,
                  selectedSubject === subject && styles.subjectTextSelected,
                ]}
              >
                {subject}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4ade80" />
          <Text style={styles.loadingText}>Loading images...</Text>
        </View>
      )}

      {!loading && rows.length > 0 && (
        <>
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[
                styles.tab,
                activeTab === 'NO_IMAGES' && styles.tabActive,
              ]}
              onPress={() => setActiveTab('NO_IMAGES')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'NO_IMAGES' && styles.tabTextActive,
                ]}
              >
                ❌ No Images ({classified.noImages.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tab,
                activeTab === 'EXTERNAL_ONLY' && styles.tabActive,
              ]}
              onPress={() => setActiveTab('EXTERNAL_ONLY')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'EXTERNAL_ONLY' && styles.tabTextActive,
                ]}
              >
                🌐 External Only ({classified.externalOnly.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tab,
                activeTab === 'UPLOADED' && styles.tabActive,
              ]}
              onPress={() => setActiveTab('UPLOADED')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'UPLOADED' && styles.tabTextActive,
                ]}
              >
                ✅ Uploaded ({classified.uploaded.length})
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {activeTab === 'NO_IMAGES' && (
              <Section
                title="❌ No Images"
                count={classified.noImages.length}
                rows={classified.noImages}
                color="#ef4444"
                onDownload={handleDownload}
                uploadingIds={uploadingIds}
              />
            )}

            {activeTab === 'EXTERNAL_ONLY' && (
              <Section
                title="🌐 External Image Only"
                count={classified.externalOnly.length}
                rows={classified.externalOnly}
                color="#f59e0b"
                onDownload={handleDownload}
                onUpload={handleUpload}
                uploadingIds={uploadingIds}
              />
            )}

            {activeTab === 'UPLOADED' && (
              <Section
                title="✅ Uploaded to Bunny"
                count={classified.uploaded.length}
                rows={classified.uploaded}
                color="#4ade80"
                onDownload={handleDownload}
                uploadingIds={uploadingIds}
              />
            )}
          </ScrollView>
        </>
      )}

      {!loading && selectedSubject && rows.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No images found for {selectedSubject}</Text>
        </View>
      )}

      {!loading && !selectedSubject && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Select a subject to begin</Text>
        </View>
      )}
    </View>
  );
}

type SectionProps = {
  title: string;
  count: number;
  rows: ImageRow[];
  color: string;
  onDownload: (url: string) => void;
  onUpload?: (row: ImageRow) => void;
  uploadingIds: Set<string>;
};

function Section({ title, count, rows, color, onDownload, onUpload, uploadingIds }: SectionProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (rows.length === 0) return null;

  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.sectionHeader} onPress={() => setCollapsed(!collapsed)}>
        <Text style={[styles.sectionTitle, { color }]}>
          {title} ({count})
        </Text>
        <Text style={styles.collapseIcon}>{collapsed ? '▶' : '▼'}</Text>
      </TouchableOpacity>

      {!collapsed && (
        <View style={styles.sectionContent}>
          {rows.map((row) => (
            <RowItem
              key={row.id}
              row={row}
              onDownload={onDownload}
              onUpload={onUpload}
              isUploading={uploadingIds.has(row.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

type RowItemProps = {
  row: ImageRow;
  onDownload: (url: string) => void;
  onUpload?: (row: ImageRow) => void;
  isUploading: boolean;
};

function RowItem({ row, onDownload, onUpload, isUploading }: RowItemProps) {
  const displayUrl = row.image_url ?? row.supabase_image_url;

  const copyToClipboard = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      Alert.alert('Copied', 'ID copied to clipboard');
    }
  };

  return (
    <View style={styles.rowCard}>
      <View style={styles.rowHeader}>
        <Text style={styles.orderNumber}>{row.react_order_final}</Text>
        <Pressable onPress={() => copyToClipboard(row.id)}>
          <Text style={styles.rowId}>{row.id.slice(0, 8)}...</Text>
        </Pressable>
      </View>

      <View style={styles.rowContent}>
        {displayUrl ? (
          <TouchableOpacity
            onPress={() => row.image_url && onDownload(row.image_url)}
            disabled={!row.image_url}
          >
            <Image source={{ uri: displayUrl }} style={styles.imagePreview} resizeMode="cover" />
          </TouchableOpacity>
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.placeholderText}>No Image</Text>
          </View>
        )}

        {onUpload && (
          <TouchableOpacity
            style={[styles.uploadButton, isUploading && styles.uploadButtonDisabled]}
            onPress={() => onUpload(row)}
            disabled={isUploading}
          >
            {isUploading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.uploadButtonText}>⬆️ Upload to Bunny</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0b0b',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#111111',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  subjectContainer: {
    backgroundColor: '#111111',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  subjectScroll: {
    paddingHorizontal: 20,
    gap: 12,
  },
  subjectPill: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333333',
  },
  subjectPillSelected: {
    backgroundColor: '#4ade80',
    borderColor: '#4ade80',
  },
  subjectText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#888888',
  },
  subjectTextSelected: {
    color: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#888888',
  },
  content: {
    flex: 1,
  },
  section: {
    marginVertical: 12,
    marginHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  collapseIcon: {
    fontSize: 16,
    color: '#888888',
  },
  sectionContent: {
    gap: 12,
  },
  rowCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#222222',
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  rowId: {
    fontSize: 12,
    color: '#666666',
    fontFamily: 'monospace',
  },
  rowContent: {
    gap: 12,
  },
  imagePreview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#0b0b0b',
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#0b0b0b',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#333333',
    borderStyle: 'dashed',
  },
  placeholderText: {
    fontSize: 16,
    color: '#666666',
  },
  uploadButton: {
    backgroundColor: '#4ade80',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  uploadButtonDisabled: {
    backgroundColor: '#333333',
  },
  uploadButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666666',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#111111',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  tabActive: {
    backgroundColor: '#4ade80',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888888',
    textAlign: 'center',
  },
  tabTextActive: {
    color: '#000000',
  },
});
