// 自定义页面附件上传最小示例
// 用法：将 APP_TYPE / FORM_UUID / FIELDS.evidence 替换成实际值

var APP_TYPE = 'APP_XXX';
var FORM_UUID = 'FORM-XXX';

var FIELDS = {
  evidence: 'attachmentField_xxx',
};

var _customState = {
  attachments: [],
  progress: {},
  failedFiles: {},
  uploading: false,
};

export function getCustomState(key) {
  if (key) {
    return _customState[key];
  }
  return { ..._customState };
}

export function setCustomState(newState) {
  Object.keys(newState).forEach(function(key) {
    _customState[key] = newState[key];
  });
  this.forceUpdate();
}

export function forceUpdate() {
  this.setState({ timestamp: new Date().getTime() });
}

export function didMount() {}

export function didUnmount() {}

export function selectAndUploadAttachments() {
  var self = this;

  this.setCustomState({ uploading: true });
  this.utils.uploadFiles({
    type: 'attachment',
    maxSize: 20,
    onProgress: function(percent, progressEvent, file) {
      var progress = { ..._customState.progress };
      progress[file.name] = Math.round(percent);
      self.setCustomState({ progress: progress });
    },
    onFileSuccess: function(uploadedFile) {
      self.setCustomState({
        attachments: (_customState.attachments || []).concat(uploadedFile),
      });
    },
    onFileError: function(error, sourceFile, index) {
      var failedFiles = { ..._customState.failedFiles };
      failedFiles[index + ':' + sourceFile.name] = {
        sourceFile: sourceFile,
        error: error,
      };
      self.setCustomState({ failedFiles: failedFiles });
    },
    onSuccess: function(uploadedFiles) {
      self.setCustomState({ uploading: false });
      if (uploadedFiles.length) {
        self.utils.toast({ title: '附件上传成功', type: 'success' });
      }
    },
    onError: function(error) {
      self.setCustomState({ uploading: false });
      self.utils.toast({
        title: error && error.message ? error.message : '部分附件上传失败',
        type: 'error',
      });
    },
  }).catch(function() {
    // onError 已更新页面状态；消费 uploadFiles 保留的 Promise rejection。
  });
}

export function removeAttachment(file) {
  var self = this;
  this.utils.removeUploadedFile(file).catch(function(error) {
    self.utils.toast({
      title: error && error.message ? error.message : '删除临时文件失败',
      type: 'error',
    });
  });

  this.setCustomState({
    attachments: (_customState.attachments || []).filter(function(item) {
      return item.fileUuid !== file.fileUuid;
    }),
  });
}

export function previewAttachment(file) {
  this.utils.previewFile(file, { files: _customState.attachments });
}

export function submitForm() {
  var formData = {};
  formData[FIELDS.evidence] = _customState.attachments;

  this.utils.yida.saveFormData({
    appType: APP_TYPE,
    formUuid: FORM_UUID,
    formDataJson: JSON.stringify(formData),
  }).then(function() {
    this.utils.toast({ title: '提交成功', type: 'success' });
  }.bind(this)).catch(function(error) {
    this.utils.toast({
      title: error && error.message ? error.message : '提交失败',
      type: 'error',
    });
  }.bind(this));
}

var styles = {
  page: {
    padding: '16px',
    minHeight: '100vh',
    background: '#f7f8fa',
    borderRadius: '0 !important',
  },
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '108px',
    height: '36px',
    padding: '0 12px',
    borderRadius: '8px',
    background: 'var(--color-brand1-6, #1677FF)',
    color: '#fff',
    border: 'none',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  item: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
    minHeight: '36px',
    padding: '8px 10px',
    marginTop: '8px',
    background: '#fff',
    border: '1px solid #e5e6eb',
    borderRadius: '8px',
  },
};

export function renderJsx() {
  var state = this.getCustomState();
  var self = this;

  return (
    <div style={styles.page}>
      <div style={{ display: 'none' }}>{this.state.timestamp}</div>

      <button
        type="button"
        style={styles.btn}
        disabled={state.uploading}
        onClick={() => { self.selectAndUploadAttachments(); }}
      >
        {state.uploading ? '上传中' : '选择附件'}
      </button>

      {Object.keys(state.failedFiles || {}).length > 0 && (
        <div style={{ marginTop: '8px' }}>
          上传失败：{Object.keys(state.failedFiles || {}).length} 个文件
        </div>
      )}

      {(state.attachments || []).map((item) => {
        return (
          <div key={item.fileUuid} style={styles.item}>
            <button type="button" onClick={() => { self.previewAttachment(item); }}>
              {item.name}
            </button>
            <span>{state.progress[item.name] || 100}%</span>
            <button type="button" style={styles.btn} onClick={() => { self.removeAttachment(item); }}>
              删除
            </button>
          </div>
        );
      })}

      <div style={{ marginTop: '16px' }}>
        <button type="button" style={styles.btn} onClick={() => { self.submitForm(); }}>提交</button>
      </div>
    </div>
  );
}
