<script>
  import { containerStyle, textStyle, buttonClass, renderText, evalExpr, truthy } from './kit.js';

  export let node;
  export let state = {};
  export let onEvent = () => {};
</script>

{#if node.type === 'Column' || node.type === 'Row'}
  <div class="container" style={containerStyle(node)}>
    {#each node.children ?? [] as child, i (i)}
      <svelte:self node={child} {state} {onEvent} />
    {/each}
  </div>
{:else if node.type === 'If'}
  {#if truthy(evalExpr(node.cond, state))}
    {#each node.children ?? [] as child, i (i)}
      <svelte:self node={child} {state} {onEvent} />
    {/each}
  {:else}
    {#each node.else ?? [] as child, i (i)}
      <svelte:self node={child} {state} {onEvent} />
    {/each}
  {/if}
{:else if node.type === 'For'}
  {@const _iterable = evalExpr(node.iterable, state)}
  {@const iterable = Array.isArray(_iterable) ? _iterable : []}
  {#each iterable as value, i (i)}
    {@const scope = { ...state, [node.item]: value }}
    {#each node.children ?? [] as child, j (j)}
      <svelte:self node={child} state={scope} {onEvent} />
    {/each}
  {/each}
{:else if node.type === 'Text'}
  <div class="text" style={textStyle(node)}>{renderText(node.props?.value, state)}</div>
{:else if node.type === 'Button'}
  <button
    class={buttonClass(node.props?.variant)}
    style={node.props?.color ? `background-color:${node.props.color};border-color:${node.props.color};` : ''}
    on:click={() => onEvent('click', { nodeId: node.props?.id })}
  >
    {renderText(node.props?.text, state)}
  </button>
{:else if node.type === 'TextInput'}
  <label class="field">
    {#if node.props?.label}
      <span class="field-label">{renderText(node.props.label, state)}</span>
    {/if}
    <input
      type={node.props?.type === 'password' ? 'password' : 'text'}
      placeholder={node.props?.placeholder ? renderText(node.props.placeholder, state) : ''}
      value={node.props?.bind ? state[node.props.bind] ?? '' : ''}
      on:input={(e) => onEvent('input', { nodeId: node.props?.id, value: e.currentTarget.value })}
    />
  </label>
{:else if node.type === 'Checkbox'}
  <label class="field check">
    <input
      type="checkbox"
      checked={node.props?.bind ? Boolean(state[node.props.bind]) : false}
      on:change={(e) => onEvent('toggle', { nodeId: node.props?.id, checked: e.currentTarget.checked })}
    />
    {#if node.props?.label}
      <span>{renderText(node.props.label, state)}</span>
    {/if}
  </label>
{:else if node.type === 'Select'}
  <label class="field">
    {#if node.props?.label}
      <span class="field-label">{renderText(node.props.label, state)}</span>
    {/if}
    <select
      class="sel"
      value={node.props?.bind ? state[node.props.bind] ?? '' : ''}
      on:change={(e) => onEvent('select', { nodeId: node.props?.id, value: e.currentTarget.value })}
    >
      {#each node.props?.options ?? [] as opt, i (i)}
        <option value={opt}>{opt}</option>
      {/each}
    </select>
  </label>
{:else if node.type === 'Slider'}
  <label class="field">
    {#if node.props?.label}
      <span class="field-label">{renderText(node.props.label, state)}</span>
    {/if}
    <input
      class="slider"
      type="range"
      min={node.props?.min ?? 0}
      max={node.props?.max ?? 100}
      step={node.props?.step ?? 1}
      value={node.props?.bind ? Number(state[node.props.bind] ?? 0) : 0}
      on:input={(e) => onEvent('slider', { nodeId: node.props?.id, value: e.currentTarget.value })}
    />
  </label>
{:else if node.type === 'Image'}
  <img
    src={node.props?.src}
    style="width:{node.props?.width ?? 'auto'}px;height:{node.props?.height ? node.props.height + 'px' : 'auto'};"
    alt=""
  />
{/if}

<style>
  .container {
    width: 100%;
  }
  .text {
    font-size: 15px;
    color: var(--text);
    line-height: 1.5;
    word-break: break-word;
  }
  .btn {
    border: 1px solid transparent;
    border-radius: 9px;
    padding: 11px 16px;
    font-size: 14px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: transform 0.08s ease, box-shadow 0.15s ease, background 0.15s ease, border-color 0.15s ease;
  }
  .btn:active {
    transform: scale(0.97);
  }
  .btn-primary {
    background: var(--accent);
    color: #fff;
    box-shadow: 0 6px 16px -6px var(--accent);
  }
  .btn-primary:hover {
    background: var(--accent-hover);
    box-shadow: 0 8px 20px -6px var(--accent);
  }
  .btn-secondary {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .btn-secondary:hover {
    filter: brightness(1.06);
  }
  .btn-ghost {
    background: transparent;
    color: var(--text-dim);
    border-color: var(--border);
  }
  .btn-ghost:hover {
    color: var(--text);
    border-color: var(--accent);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }
  .field-label {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-dim);
    letter-spacing: 0.2px;
  }
  .field input[type='text'],
  .field input[type='password'] {
    border: 1px solid var(--border);
    background: var(--window);
    color: var(--text);
    border-radius: 9px;
    padding: 10px 12px;
    font-size: 14px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .field input[type='text']:focus,
  .field input[type='password']:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .field input::placeholder {
    color: var(--text-dim);
    opacity: 0.7;
  }
  .field select.sel {
    border: 1px solid var(--border);
    background: var(--window);
    color: var(--text);
    border-radius: 9px;
    padding: 10px 12px;
    font-size: 14px;
    font-family: inherit;
    outline: none;
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .field select.sel:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .field input[type='range'].slider {
    width: 100%;
    accent-color: var(--accent);
    cursor: pointer;
  }
  .check {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: var(--text);
    cursor: pointer;
  }
  .check input[type='checkbox'] {
    width: 16px;
    height: 16px;
    accent-color: var(--accent);
    cursor: pointer;
  }
  img {
    border-radius: 8px;
    max-width: 100%;
  }
</style>
