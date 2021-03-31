# ArrayList

:::tip 重要
ArrayList 是 java 集合框架中比较常用的数据结构了。继承自 AbstractList，实现了 List 接口。
底层基于数组实现容量大小动态变化。允许 null 的存在。同时还实现了 RandomAccess、Cloneable、Serializable 接口，
所以 ArrayList 是支持快速访问、复制、序列化的。
:::

```java
public class ArrayList<E> extends AbstractList<E>
        implements List<E>, RandomAccess, Cloneable, java.io.Serializable
{
    private static final long serialVersionUID = 8683452581122892189L;
    .
    .
    .
}
```

## 属性

```java

    /**
     * 数组初始化容量
     * Default initial capacity.
     */
    private static final int DEFAULT_CAPACITY = 10;

    /**
     * 当ArrayList是空实例的时候，使用共享的数组实例
     * Shared empty array instance used for empty instances.
     */
    private static final Object[] EMPTY_ELEMENTDATA = {};

    /**
     * 用于默认大小的空实例的共享空数组实例
     * Shared empty array instance used for default sized empty instances. We
     * distinguish this from EMPTY_ELEMENTDATA to know how much to inflate when
     * first element is added.
     */
    private static final Object[] DEFAULTCAPACITY_EMPTY_ELEMENTDATA = {};

    /**
     * 数组存放元素的地方
     * The array buffer into which the elements of the ArrayList are stored.
     * The capacity of the ArrayList is the length of this array buffer. Any
     * empty ArrayList with elementData == DEFAULTCAPACITY_EMPTY_ELEMENTDATA
     * will be expanded to DEFAULT_CAPACITY when the first element is added.
     */
    transient Object[] elementData; // non-private to simplify nested class access

    /**
     * 数组中存放元素的数量
     * The size of the ArrayList (the number of elements it contains).
     *
     * @serial
     */
    private int size;

    /**
     * 有些虚拟机会在数组中保存 header words 头部字
     * The maximum size of array to allocate.
     * Some VMs reserve some header words in an array.
     * Attempts to allocate larger arrays may result in
     * OutOfMemoryError: Requested array size exceeds VM limit
     */
    private static final int MAX_ARRAY_SIZE = Integer.MAX_VALUE - 8;

```

## 构造函数

```java

    public ArrayList(int initialCapacity) {
        if (initialCapacity > 0) {
            // 当初始化容量大于0时，创建相应数量大小的数组
            this.elementData = new Object[initialCapacity];
        } else if (initialCapacity == 0) {
            // 如果初始化容量等于0时，elementData指向 EMPTY_ELEMENTDATA
            this.elementData = EMPTY_ELEMENTDATA;
        } else {
            // 抛出参数异常
            throw new IllegalArgumentException("Illegal Capacity: "+
                initialCapacity);
        }
    }

    public ArrayList() {
        // 默认初始化时，elementData指向 DEFAULTCAPACITY_EMPTY_ELEMENTDATA
        this.elementData = DEFAULTCAPACITY_EMPTY_ELEMENTDATA;
    }

    public ArrayList(Collection<? extends E> c) {
        // 调用集合接口 toArray() 将集合转成Object[]数组
        Object[] a = c.toArray();
        if ((size = a.length) != 0) {
            // 将 a.length赋值给size，并且size大小不等于0时
            if (c.getClass() == ArrayList.class) {
                // 如果集合c的实现类是ArrayList.class的话，直接 elementData 指向 a数组
                elementData = a;
            } else {
                // 如果集合c的实现类不是ArrayList，那么调用底层copy数组命令，产生一个新的堆内存
                elementData = Arrays.copyOf(a, size, Object[].class);
            }
        } else {
            // replace with empty array.
            // 如果集合容量为0时，让elementData指向 EMPTY_ELEMENTDATA
            elementData = EMPTY_ELEMENTDATA;
        }
    }
```

## 方法

### trimToSize

将 elementData 的长度压缩成与 size 大小相同

```java
    public void trimToSize() {
        // 修改次数+1
        modCount++;
        if (size < elementData.length) {
            // 如果元素大小小于 elementData 的长度
            // 如果size==0 elementData 指向 EMPTY_ELEMENTDATA 否则 调用系统底层数组copy方法，将 elementData copy成size长度的数组
            elementData = (size == 0)
              ? EMPTY_ELEMENTDATA
              : Arrays.copyOf(elementData, size);
        }
    }
```

### add(E e)

添加元素

```java
    public boolean add(E e) {
        // 将size+1传进 ensureCapacityInternal 确保空间足够（这里的size并没有+1）
        ensureCapacityInternal(size + 1);  // Increments modCount!!
        elementData[size++] = e;
        return true;
    }
```

### add(int index, E element)

向指定索引添加元素

```java
    public void add(int index, E element) {
        rangeCheckForAdd(index);

        ensureCapacityInternal(size + 1);  // Increments modCount!!
        System.arraycopy(elementData, index, elementData, index + 1,
                         size - index);
        elementData[index] = element;
        size++;
    }
```

### ensureCapacityInternal

:::tip 重要

- minCapacity 这次扩容最小需要的容量
- oldCapacity 扩容前原始数组容量
- newCapacity 预计要扩容到的容量

:::

```java
    private void ensureCapacityInternal(int minCapacity) {
        // 根据 elementData，minCapacity计算容量
        ensureExplicitCapacity(calculateCapacity(elementData, minCapacity));
    }
```

### calculateCapacity

计算容量

```java
    private static int calculateCapacity(Object[] elementData, int minCapacity) {
        if (elementData == DEFAULTCAPACITY_EMPTY_ELEMENTDATA) {
            // 如果 elementData是指向 DEFAULTCAPACITY_EMPTY_ELEMENTDATA，那么Array通过无参初始化而来
            // 返回 DEFAULT_CAPACITY(10),minCapacity中的最大值
            return Math.max(DEFAULT_CAPACITY, minCapacity);
        }
        // 返回传入的minCapacity(size+1)
        return minCapacity;
    }
```

### ensureExplicitCapacity

保证准确的数组容量

```java
    private void ensureExplicitCapacity(int minCapacity) {
        // 到了这里算是最后一步，增加修改次数
        modCount++;
        // overflow-conscious code
        // 如果 minCapacity 大于 elementData的长度。
        // case1: size+1 （说明数组要塞满了，得进行扩容）
        // case2: DEFAULT_CAPACIT （数组得进行扩容，因为要初始化）
        if (minCapacity - elementData.length > 0)
            // 扩容
            grow(minCapacity);
    }
```

### grow

```java
    private void grow(int minCapacity) {
        // overflow-conscious code
        // 旧容量
        int oldCapacity = elementData.length;
        // 新容量是旧容量的1.5倍
        int newCapacity = oldCapacity + (oldCapacity >> 1);
        if (newCapacity - minCapacity < 0)
            // 这里可能存在newCapacity溢出
            // 如果新容量小于传入的容量，用传入的容量进行扩容
            newCapacity = minCapacity;
        if (newCapacity - MAX_ARRAY_SIZE > 0)
            // 如果 newCapacity 大于 MAX_ARRAY_SIZE(Integer.MAX_VALUE - 8)
            // 调用 hugeCapacity 确定最终的容量大小
            newCapacity = hugeCapacity(minCapacity);
        // minCapacity is usually close to size, so this is a win:
        elementData = Arrays.copyOf(elementData, newCapacity);
    }
```

### hugeCapacity

数组理论上长度就是 Integer.MAX_VALUE 个别 JVM 设计上的问题，咱们可以尽量照顾下，
但并不是说一定因为个别 JVM 就一定不让扩容到 整数最大值长度。
如果再满了 那么对不起 直接到将数组长度设置为整数最大值

```java
    private static int hugeCapacity(int minCapacity) {
        // 如果minCapacity小于0，抛出错误
        if (minCapacity < 0) // overflow
            throw new OutOfMemoryError();
        // 如果minCapacity大于MAX_ARRAY_SIZE(Integer.MAX_VALUE - 8)，返回Integer.MAX_VALUE
        // 如果minCapacity小于MAX_ARRAY_SIZE(Integer.MAX_VALUE - 8)，返回Integer.MAX_VALUE-8
        return (minCapacity > MAX_ARRAY_SIZE) ?
            Integer.MAX_VALUE :
            MAX_ARRAY_SIZE;
    }
```

### rangeCheck

索引越界检查

```java
    private void rangeCheck(int index) {
        if (index >= size)
            throw new IndexOutOfBoundsException(outOfBoundsMsg(index));
    }
```

### rangeCheckForAdd

根据索引添加元素的时候进行越界检查

```java
    private void rangeCheckForAdd(int index) {
        // 如果索引大于元素长度 或 小于0 抛出越界异常
        if (index > size || index < 0)
            throw new IndexOutOfBoundsException(outOfBoundsMsg(index));
    }
```

### removeAll

数组中元素只有包含在集合 c 中都删除

```java
    public boolean removeAll(Collection<?> c) {
        // 判空
        Objects.requireNonNull(c);
        return batchRemove(c, false);
    }
```

### retainAll

数组中元素只有包含在集合 c 中都保留

```java
    public boolean retainAll(Collection<?> c) {
        // 判空
        Objects.requireNonNull(c);
        return batchRemove(c, true);
    }
```

### batchRemove

```java
    private boolean batchRemove(Collection<?> c, boolean complement) {
        // 定义elementData变量指向 ArrayList的 elementData
        final Object[] elementData = this.elementData;
        // 定义 读、写索引
        int r = 0, w = 0;
        // 定义修改标志
        boolean modified = false;
        try {
            // 遍历数组
            for (; r < size; r++)
                // 这里 complement 是传入的标致
                // 当前循环元素 elementData[r]
                // 如果 complement == false，如果集合c包含当前元素，不走if逻辑，说明移除元素
                // 如果 complement == true，如果集合c包含当前元素，走if逻辑，说明保留元素
                if (c.contains(elementData[r]) == complement)
                    elementData[w++] = elementData[r];
        } finally {
            // Preserve behavioral compatibility with AbstractCollection,
            // even if c.contains() throws.
            // 如果c.contains()抛出移除
            if (r != size) {
                // 如果读索引不等于数组元素大小
                // 从r位置开始，长度为size-r的元素 从 elementData w位置开始 copy
                System.arraycopy(elementData, r,
                                 elementData, w,
                                 size - r);
                // w加上因异常还没有读到的长度
                w += size - r;
            }
            if (w != size) {
                // 如果w不等于元素大小了
                // clear to let GC do its work
                for (int i = w; i < size; i++)
                    // 将后面的元素置空，让GC工作
                    elementData[i] = null;
                // 更新修改次数
                modCount += size - w;
                // 更新元素大小
                size = w;
                // 修改标志true（数组被修改了）
                modified = true;
            }
        }
        return modified;
    }
```
