# 自定义页面附件与图片上传

> 本文说明如何使用宜搭运行时文件 API 上传附件或图片，并将返回值写入 `AttachmentField` / `ImageField`。

## 适用场景

- 平台 JSX 页面通过 `this.utils` 上传文件
- `YidaCodeCanvas` 页面通过 `props.utils` 上传文件
- 自定义提交页需要展示上传进度、取消上传、预览、下载或删除临时文件
- 最终需要把上传结果写入宜搭表单字段

## 核心结论

优先使用运行时提供的文件 API，不要在页面中手写 `/ossSign`、OSS `FormData` 和上传回调注册逻辑：

| 能力 | 平台 JSX 页面 | YidaCodeCanvas 页面 |
| --- | --- | --- |
| 单文件上传 | `this.utils.uploadFile(options)` | `props.utils.uploadFile(options)` |
| 批量上传 | `this.utils.uploadFiles(options)` | `props.utils.uploadFiles(options)` |
| 删除临时文件 | `this.utils.removeUploadedFile(file)` | `props.utils.removeUploadedFile(file)` |
| 预览 | `this.utils.previewFile(file, options)` | `props.utils.previewFile(file, options)` |
| 下载 | `this.utils.downloadFile(file, onError)` | `props.utils.downloadFile(file, onError)` |

上传 API 已封装文件选择、权限校验、文件校验、OSS 签名、文件传输、上传结果注册和返回值归一化。页面不要自行创建 input、读取 CSRF token，也不要自行拼接 OSS key、`Content-Disposition` 或回调地址。需要上传拖拽、粘贴等场景已有的 File 时，通过 `options.file/files` 传入；省略时 API 自动拉起单选或多选文件选择器。

> `YidaCodeCanvas` 中没有页面实例 `this`。只能使用组件收到的 `props.utils`；调用前应检查目标运行时是否已经提供相应方法，并保留不可用提示。

## uploadFile

```js
utils.uploadFile(options)
```

### options

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `file` / `files` | `File` / `File[]` / `FileList` | - | 可选；不传时分别打开单选/多选文件选择器 |
| `type` | `'image' \| 'attachment'` | 自动判断 | 根据 MIME 和扩展名判断；显式传 `image` 时非图片会在上传前被拒绝 |
| `accept` | `string` | 图片默认 `image/*` | 支持 `.png`、`image/png`、`image/*` 等规则，多个规则用逗号分隔；无法识别的规则为兼容历史行为不参与拦截 |
| `maxSize` | `number` | 图片 50、附件 100 | 单文件大小上限，单位 MB；传入更大值会收紧到系统上限，文件大小必须严格小于最终上限 |
| `timeout` | `number` | - | OSS 传输超时时间，单位毫秒 |
| `signal` | `AbortSignal` | - | 取消文件选择等待或 OSS 上传 |
| `capture` | `boolean \| 'user' \| 'environment'` | - | 自动创建 input 时指定移动端摄像头方向 |
| `previewImageProcess` | `boolean` | `true` | 对可处理的非 GIF 图片，在 `/ossFileHandle?` 预览地址尚无 `process` 时添加组件一致的 200×200 裁剪及质量参数；`false` 时不主动追加，已有参数不移除 |
| `onProgress` | `function` | - | OSS 传输进度回调 `(percent, event, file)` |
| `onFileSuccess` | `function` | - | 仅批量上传；单文件成功回调 `(uploadedFile, sourceFile, index)` |
| `onFileError` | `function` | - | 仅批量上传；单文件失败回调 `(error, sourceFile, index)` |
| `onSuccess` | `function` | - | 整体成功回调；单文件参数为文件对象，多文件参数为文件数组 |
| `onError` | `function` | - | 整体失败回调 `(error)` |

进度回调签名：

```js
function onProgress(percent, event, file) {
  // percent: 0 到 100
  // event.loaded / event.total: 已上传和总字节数
  // file: 当前文件，批量上传时用于区分文件
}
```

进度仅表示浏览器到 OSS 的**文件传输阶段**，不包含文件选择、上传前的权限校验、签名请求和上传后的文件注册耗时。批量上传提供逐文件进度，不提供聚合总进度。

批量上传时，每个文件完成后分别触发 `onFileSuccess` 或 `onFileError`。返回的 Promise 在任一任务失败时 reject，但其他任务不会自动取消；全部任务结束后，只有全部成功才触发整体 `onSuccess`，只要存在失败就触发一次整体 `onError`。因此逐文件回调和整体 `onError` 可能在 Promise 已 reject 后继续触发，页面应通过逐文件回调维护成功列表和失败重试列表。文件选择阶段失败则直接触发 `onError` 并 reject，不会启动上传任务。

回调不会替代 Promise：成功仍 resolve，失败仍 reject，回调自身抛错不会改变上传结果。纯回调写法也要对返回 Promise 添加 `catch` 以消费 rejection；Promise 写法则使用 `await` / `try...catch` 或 `.then().catch()`，不要在 `onSuccess` 和 `.then()` 中重复追加同一批文件。

用户关闭文件选择器时，`uploadFile` 返回 `null`，`uploadFiles` 返回 `[]`，并分别以 `null` / `[]` 调用 `onSuccess`，不作为上传错误。文件选择器必须由点击等用户操作直接触发，不要在调用前执行异步请求，否则浏览器或 WebView 可能阻止弹出。同一时刻只能打开一个由 API 创建的文件选择器，重复调用会产生 `select` 阶段错误。批量成功结果保持输入文件顺序，不按完成先后排序。

### 返回值

```js
{
  name: 'report.pdf',
  size: 102400,
  type: 'application/pdf',
  fileUuid: 'APP_XXX/2026/8-17/UUID.pdf',
  url: '/ossFileHandle?...',
  previewUrl: '/inst/preview?...',
  downloadUrl: '/ossFileHandle?...type=download'
}
```

`AttachmentField` 和 `ImageField` 都需要文件对象数组，不能直接保存浏览器 `File`，也不能保存纯文本。

## 平台 JSX 页面示例

```javascript
var _customState = {
  attachments: [],
  progress: {},
  failedFiles: {},
  uploading: false,
};

export function selectAndUploadAttachments() {
  var self = this;

  this.setCustomState({ uploading: true });
  this.utils.uploadFiles({
    type: 'attachment',
    accept: '.pdf,.doc,.docx,image/*',
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
    onSuccess: function(uploaded) {
      self.setCustomState({ uploading: false });
      if (uploaded.length) {
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
```

失败列表保留了原始 `sourceFile`，可以使用单文件 API 定向重试：

```javascript
export function retryFailedAttachment(key) {
  var self = this;
  var failedItem = _customState.failedFiles[key];
  if (!failedItem) return;

  this.utils.uploadFile({
    file: failedItem.sourceFile,
    type: 'attachment',
    maxSize: 20,
    onSuccess: function(uploadedFile) {
      var failedFiles = { ..._customState.failedFiles };
      delete failedFiles[key];
      self.setCustomState({
        attachments: (_customState.attachments || []).concat(uploadedFile),
        failedFiles: failedFiles,
      });
    },
    onError: function(error) {
      self.utils.toast({
        title: error && error.message ? error.message : '重试失败',
        type: 'error',
      });
    },
  }).catch(function() {
    // onError 已处理重试失败；消费 uploadFile 保留的 Promise rejection。
  });
}
```

保存表单时直接写入标准化后的数组：

```javascript
export function submitForm() {
  this.utils.yida.saveFormData({
    appType: 'APP_XXX',
    formUuid: 'FORM-XXX',
    formDataJson: JSON.stringify({
      attachmentField_xxx: _customState.attachments,
    }),
  }).catch(function(error) {
    this.utils.toast({
      title: error && error.message ? error.message : '提交失败',
      type: 'error',
    });
  }.bind(this));
}
```

完整示例见 [附件上传示例](../examples/attachment-upload.js)。

## YidaCodeCanvas 示例

```jsx
import React, { useEffect, useRef, useState } from 'react';

export default function YidaComp(props) {
  const utils = props.utils;
  const abortRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState({});
  const [failedFiles, setFailedFiles] = useState({});
  const [uploading, setUploading] = useState(false);

  useEffect(() => () => abortRef.current?.abort(), []);

  function selectAndUpload() {
    if (!utils || typeof utils.uploadFiles !== 'function') {
      throw new Error('当前运行时暂不支持文件上传 API');
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setUploading(true);
    utils.uploadFiles({
      type: 'attachment',
      accept: '.pdf,.doc,.docx,image/*',
      maxSize: 20,
      signal: controller.signal,
      onProgress(percent, progressEvent, file) {
        setProgress((current) => ({
          ...current,
          [file.name]: Math.round(percent),
        }));
      },
      onFileSuccess(uploadedFile) {
        setFiles((current) => current.concat(uploadedFile));
      },
      onFileError(error, sourceFile, index) {
        setFailedFiles((current) => ({
          ...current,
          [`${index}:${sourceFile.name}`]: { sourceFile, error },
        }));
      },
      onSuccess() {
        setUploading(false);
        abortRef.current = null;
      },
      onError() {
        setUploading(false);
        abortRef.current = null;
      },
    }).catch(() => {
      // onError 已处理整体状态；消费 uploadFiles 保留的 Promise rejection。
    });
  }

  return (
    <div>
      <button onClick={selectAndUpload} disabled={uploading}>选择附件</button>
      {uploading && <button onClick={() => abortRef.current?.abort()}>取消上传</button>}
      {Object.keys(failedFiles).length > 0 && <div>失败文件：{Object.keys(failedFiles).length}</div>}
      {files.map((file) => (
        <div key={file.fileUuid}>
          <span>{file.name}</span>
          <button onClick={() => utils.previewFile(file)}>预览</button>
          <span>{progress[file.name] ?? 100}%</span>
        </div>
      ))}
    </div>
  );
}
```

Canvas 页面卸载时如果仍可能上传，应在 `useEffect` cleanup 中调用 `AbortController.abort()`。

## 删除、预览和下载

```javascript
// 删除尚未绑定表单实例的临时文件
this.utils.removeUploadedFile(file).then(function(removed) {
  console.log('是否执行删除:', removed);
});

// JPEG/PNG 使用图片查看器；其他格式打开解析出的预览或下载地址
var previewed = this.utils.previewFile(file, { files: allFiles, openLink: true });
// previewed 为 false 表示没有可用地址

// 下载失败时接收错误
this.utils.downloadFile(file, function(error) {
  console.error(error);
});
```

`removeUploadedFile` 只负责平台允许删除的临时文件。成功删除返回 `true`；复制流程（URL 含 `cacheCode`）、当前页面已有表单实例或无法解析 `fileUuid` 时不发删除请求并返回 `false`；请求失败以 `remove` 阶段错误 reject。页面仍需自行更新本地文件列表。`downloadFile` 优先使用 `downloadUrl/downloadURL`、否则使用 `url`，不会返回可等待的下载 Promise。

## 错误处理

上传失败会返回带阶段信息的错误。页面至少使用 `message` 展示用户提示；需要精细处理时可读取：

| `stage` | 说明 |
| --- | --- |
| `select` | 文件选择器不可用、重复打开或被 AbortSignal 取消 |
| `permission` | 当前用户没有上传权限 |
| `validate` | 文件类型、大小或文件对象不合法 |
| `sign` | 获取 OSS 上传参数失败 |
| `transfer` | 文件传输失败、超时或取消 |
| `register` | OSS 上传完成，但保存文件信息失败 |
| `remove` | 删除临时文件失败 |

错误码格式为 `FILE_UPLOAD_<STAGE>`，例如 `FILE_UPLOAD_VALIDATE`、`FILE_UPLOAD_TRANSFER`。

## 实现检查清单

- 使用 `uploadFile` / `uploadFiles` 自动拉起文件选择器，不自行创建 input，不手写 `/ossSign` 和 OSS 表单
- 平台 JSX 使用 `this.utils`，Canvas 使用 `props.utils`
- API 调用有 `catch` / `try...catch`，纯回调风格也消费 Promise rejection
- 使用 `onFileSuccess` / `onFileError` 分别维护成功文件和失败重试列表
- 使用整体 `onSuccess` / `onError` 在所有文件结束后恢复 loading 状态
- 批量上传通过回调第三个参数区分文件进度
- 页面展示的进度明确为 OSS 传输进度
- 表单字段保存标准化后的文件对象数组
- 删除本地列表与 `removeUploadedFile` 的 `true` / `false` / rejection 分别处理
- 预览处理无地址时返回的 `false`，不要假设所有图片格式都会进入图片查看器
- 不等待 `downloadFile` 的返回值，把失败处理放在第二个回调参数中
- 页面卸载时取消未完成上传
