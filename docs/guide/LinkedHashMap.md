# LinkedHashMap

HashMap 中的连接只是同一个桶中的元素连接，而 LinkedHashMap 是将所有桶中的节点串联成一个双向链表

:::tip 重要
LinkedHashMap 使用的是 LRU 算法(最近最少使用)
当你插入元素时它会将节点插入双向链表的链尾，如果 key 重复，则也会将节点移动至链尾，当用 get()方法获取 value 时也会将节点移动至链尾
:::

[参考](https://blog.csdn.net/blingfeng/article/details/79974169)

```java
    public class LinkedHashMap<K,V>
    extends HashMap<K,V>
    implements Map<K,V>
    {
    ...代码省略
    }
```

## 内部类

```java
    // 继承了HashMap的Node，Node基础上添加了before和after两个指针。
    static class Entry<K,V> extends HashMap.Node<K,V> {
        Entry<K,V> before, after;
        Entry(int hash, K key, V value, Node<K,V> next) {
            super(hash, key, value, next);
        }
    }
```

## 属性

```java

    /**
     * 双向链头节点
     * The head (eldest) of the doubly linked list.
     */
    transient LinkedHashMap.Entry<K,V> head;

    /**
     * 双向链尾节点
     * The tail (youngest) of the doubly linked list.
     */
    transient LinkedHashMap.Entry<K,V> tail;

    /**
     * accessOrder默认为false，即按照插入顺序来连接，true则为按照访问顺序来连接
     * The iteration ordering method for this linked hash map: <tt>true</tt>
     * for access-order, <tt>false</tt> for insertion-order.
     *
     * @serial
     */
    final boolean accessOrder;

```

## 构造方法

```java
    public LinkedHashMap(int initialCapacity, float loadFactor) {
        super(initialCapacity, loadFactor);
        accessOrder = false;
    }
    public LinkedHashMap(int initialCapacity) {
        super(initialCapacity);
        accessOrder = false;
    }
   public LinkedHashMap() {
        super();
        accessOrder = false;
    }
   public LinkedHashMap(Map<? extends K, ? extends V> m) {
        super();
        accessOrder = false;
        putMapEntries(m, false);
    }
    public LinkedHashMap(int initialCapacity,
                         float loadFactor,
                         boolean accessOrder) {
        super(initialCapacity, loadFactor);
        this.accessOrder = accessOrder;
    }

```

## 方法

### linkNodeLast

```java
    // 将节点链接到队尾
    private void linkNodeLast(LinkedHashMap.Entry<K,V> p) {
        // 暂存队尾节点
        LinkedHashMap.Entry<K,V> last = tail;
        // tail指向p节点
        tail = p;
        if (last == null)
            // 如果队尾为空，那么链表就是空的，头部节点也是 p
            head = p;
        else {
            // 如果链表不为空，关联 p 与 last
            p.before = last;
            last.after = p;
        }
    }
```

### transferLinks

```java
    // 替换节点的引用 因为在HashMap中数据存储结构是 数组+链表+树
    // 链表->树 树->链表 会涉及到 TreeNode，Node的类型变换，所以需要转移链表中的引用
    private void transferLinks(LinkedHashMap.Entry<K,V> src,
                               LinkedHashMap.Entry<K,V> dst) {
        // src：旧节点 dst：新节点
        // dst的before，after分别指向旧节点的before，after，并且赋值给b,a
        LinkedHashMap.Entry<K,V> b = dst.before = src.before;
        LinkedHashMap.Entry<K,V> a = dst.after = src.after;

        if (b == null)
            // 如果b为空，那么head指向dst
            head = dst;
        else
            // 否则b.after指向dst
            b.after = dst;
        // 同理如上
        if (a == null)
            tail = dst;
        else
            a.before = dst;
    }
```

### reinitialize

```java
    // 调用HashMap的初始化
    void reinitialize() {
        super.reinitialize();
        // 头尾指针都置空
        head = tail = null;
    }
```

### newNode

重新了 HashMap 的方法，链表或者数组中添加节点的时候，多加了一个步骤，关联到自己维护的链表尾部

```java
    Node<K,V> newNode(int hash, K key, V value, Node<K,V> e) {
        LinkedHashMap.Entry<K,V> p =
            new LinkedHashMap.Entry<K,V>(hash, key, value, e);
        // 添加至链表尾部
        linkNodeLast(p);
        return p;
    }
```

### replacementNode

重新了 HashMap 的方法，当是树表结构转链表结构的时候，替换节点的 after，before 引用

```java
    Node<K,V> replacementNode(Node<K,V> p, Node<K,V> next) {
        LinkedHashMap.Entry<K,V> q = (LinkedHashMap.Entry<K,V>)p;
        LinkedHashMap.Entry<K,V> t =
            new LinkedHashMap.Entry<K,V>(q.hash, q.key, q.value, next);
        // 替换引用
        transferLinks(q, t);
        return t;
    }
```

### newTreeNode

重新了 HashMap 的方法，像树表结构添加节点的时候，多加了一个步骤，关联到自己维护的链表尾部

```java
    TreeNode<K,V> newTreeNode(int hash, K key, V value, Node<K,V> next) {
        TreeNode<K,V> p = new TreeNode<K,V>(hash, key, value, next);
        linkNodeLast(p);
        return p;
    }
```

### replacementTreeNode

重新了 HashMap 的方法，当是链表结构转树表结构的时候，替换节点的 after，before 引用

```java
    TreeNode<K,V> replacementTreeNode(Node<K,V> p, Node<K,V> next) {
        LinkedHashMap.Entry<K,V> q = (LinkedHashMap.Entry<K,V>)p;
        TreeNode<K,V> t = new TreeNode<K,V>(q.hash, q.key, q.value, next);
        transferLinks(q, t);
        return t;
    }
```

### afterNodeRemoval（）

Callbacks to allow LinkedHashMap post-actions （ LinkedHashMap 专属的后置回调方法）

```java
    // 节点删除之后我们也要相应处理 节点（LinkedHashMap.Entry）相应after，before的关系
    void afterNodeRemoval(Node<K,V> e) { // unlink
        LinkedHashMap.Entry<K,V> p =
            (LinkedHashMap.Entry<K,V>)e, b = p.before, a = p.after;
        p.before = p.after = null;
        if (b == null)
            head = a;
        else
            b.after = a;
        if (a == null)
            tail = b;
        else
            a.before = b;
    }
```

### afterNodeInsertion

Callbacks to allow LinkedHashMap post-actions （ LinkedHashMap 专属的后置回调方法）

```java
    // 节点插入之后我们也要相应处理
    void afterNodeInsertion(boolean evict) { // possibly remove eldest
            LinkedHashMap.Entry<K,V> first;
            if (evict && (first = head) != null && removeEldestEntry(first)) {
                K key = first.key;
                removeNode(hash(key), key, null, false, true);
            }
    }
```

### removeEldestEntry

这个方法给我了我们一个覆写的机会让我们能够删除“年老的 key”

```java
    // LinkedHashMap中默认为false不删除
    protected boolean removeEldestEntry(Map.Entry<K,V> eldest) {
        return false;
    }
```

### afterNodeAccess

Callbacks to allow LinkedHashMap post-actions （ LinkedHashMap 专属的后置回调方法）

```java
    // 访问了一个节点之后的操作，前面说过 accessOrder：false 按插入顺序，true为访问顺序
    void afterNodeAccess(Node<K,V> e) { // move node to last
        LinkedHashMap.Entry<K,V> last;
        if (accessOrder && (last = tail) != e) {
            // 按访问顺序 并且 last指向tail节点并且 访问的这个节点不是尾节点
            // p指向e b指向p的before a指向p的after
            LinkedHashMap.Entry<K,V> p =
                (LinkedHashMap.Entry<K,V>)e, b = p.before, a = p.after;
            p.after = null;
            if (b == null)
                head = a;
            else
                b.after = a;
            if (a != null)
                a.before = b;
            else
                last = b;
            if (last == null)
                head = p;
            else {
                p.before = last;
                last.after = p;
            }
            // 上述操作的目的就是把e节点挪到队尾
            tail = p;
            // 修改次数+1
            ++modCount;
        }
    }
```
